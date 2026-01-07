import { SHEETS_CONFIG, DRIVE_CONFIG, AppState, Vendor, Item, WorkType, User, OutwardEntry, InwardEntry } from '../types';
import { v4 as uuidv4 } from 'uuid';

export const initGapi = async (apiKey: string) => {
  return new Promise<void>((resolve, reject) => {
    const gapi = (window as any).gapi;
    if (!gapi) return reject("Google API Script missing");
    
    gapi.load('client', async () => {
      try {
        await gapi.client.init({
          apiKey: apiKey,
          discoveryDocs: [
            "https://sheets.googleapis.com/$discovery/rest?version=v4",
            "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"
          ],
        });
        resolve();
      } catch (e) { reject(e); }
    });
  });
};

const uploadImage = async (base64String: string, fileName: string): Promise<string | null> => {
  try {
    if (!base64String || !base64String.includes(',')) return null;

    const gapi = (window as any).gapi;
    const mimeMatch = base64String.match(/data:(.*);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    const byteString = atob(base64String.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    
    const blob = new Blob([ab], { type: mimeType });
    const metadata = { name: fileName, parents: [DRIVE_CONFIG.folderId] };
    
    const accessToken = gapi.client.getToken()?.access_token;
    if (!accessToken) throw new Error("No Access Token found. Please Sync again.");

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
      body: form
    });
    
    if (!response.ok) throw new Error(`Upload Failed: ${response.statusText}`);
    const data = await response.json();
    return data.webViewLink || null;
  } catch (error) { console.error("Drive Upload Error", error); return null; }
};

const parseDate = (value: any): string => {
  try {
    if (!value) return new Date().toISOString();
    let d = new Date(value);
    if (isNaN(d.getTime())) {
      const match = String(value).trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
      if (match) d = new Date(`${match[3]}-${match[2]}-${match[1]}`);
    }
    if (isNaN(d.getTime())) return new Date().toISOString();
    const year = d.getFullYear();
    if (year < 1900 || year > 2100) return new Date().toISOString();
    return d.toISOString();
  } catch (e) { return new Date().toISOString(); }
};

// Unique Signature for Inward Entries to prevent duplicates
// Format: Date|Vendor|OutwardChallan|SKU|Qty
const getInwardSignature = (date: string, vendor: string, outChallan: string, sku: string, qty: number) => {
    return `${date.split('T')[0]}|${vendor.trim().toLowerCase()}|${outChallan.trim()}|${sku.trim().toLowerCase()}|${qty}`;
};

export const syncDataToSheets = async (state: AppState, onUpdateState: (newState: AppState) => void) => {
  const gapi = (window as any).gapi;
  if (!gapi.client.getToken()) return { success: false, message: "Authorization lost. Click Sync to login again." };

  try {
    // 1. DOWNLOAD EXISTING DATA FIRST (Check for duplicates)
    const ranges = [
      `${SHEETS_CONFIG.vendorSheetName}!A:B`,
      `${SHEETS_CONFIG.itemSheetName}!A:B`,
      `${SHEETS_CONFIG.workSheetName}!A:A`,
      `${SHEETS_CONFIG.outwardSheetName}!A:O`,
      `${SHEETS_CONFIG.inwardSheetName}!A:M`,
      `${SHEETS_CONFIG.userSheetName}!A:A`
    ];
    const resp = await gapi.client.sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, ranges });
    const valueRanges = resp.result.valueRanges;

    // Parse Existing Data
    const existingVendors = (valueRanges[0].values || []).slice(1).map((r:any) => ({ id: uuidv4(), name: r[0], code: r[1], synced: true }));
    const existingItems = (valueRanges[1].values || []).slice(1).map((r:any) => ({ id: uuidv4(), sku: r[0], description: r[1] || '', synced: true }));
    const existingWorks = (valueRanges[2].values || []).slice(1).map((r:any) => ({ id: uuidv4(), name: r[0], synced: true }));
    const existingUsers = (valueRanges[5].values || []).slice(1).map((r:any) => ({ id: uuidv4(), name: r[0], synced: true }));
    
    const existingOutwardRows = (valueRanges[3].values || []).slice(1);
    const existingInwardRows = (valueRanges[4].values || []).slice(1);

    // Build Duplicate Check Sets
    const seenOutwardChallans = new Set(existingOutwardRows.map((r:any) => r[2]?.trim()));
    const seenInwardSignatures = new Set(existingInwardRows.map((r:any) => 
        getInwardSignature(parseDate(r[0]), r[1]||'', r[2]||'', r[3]||'', parseFloat(r[4]||0))
    ));

    // 2. IDENTIFY TRULY NEW ITEMS (Filter out ones that exist in sheet)
    // Masters
    const unsyncedVendors = state.vendors.filter(e => !e.synced && !existingVendors.some(ev => ev.code === e.code));
    const unsyncedItems = state.items.filter(e => !e.synced && !existingItems.some(ei => ei.sku === e.sku));
    const unsyncedWorks = state.workTypes.filter(e => !e.synced && !existingWorks.some(ew => ew.name === e.name));
    const unsyncedUsers = state.users.filter(e => !e.synced && !existingUsers.some(eu => eu.name === e.name));
    
    // Entries
    const validOutwardToUpload = state.outwardEntries.filter(e => !e.synced && !seenOutwardChallans.has(e.challanNo.trim()));
    const validInwardToUpload = state.inwardEntries.filter(e => !e.synced).filter(e => {
         const vendorName = state.vendors.find(v => v.id === e.vendorId)?.name || 'Unknown';
         const outChallan = state.outwardEntries.find(o => o.id === e.outwardChallanId)?.challanNo || '---';
         const sku = state.items.find(i => i.id === e.skuId)?.sku || 'Unknown';
         const sig = getInwardSignature(e.date, vendorName, outChallan, sku, e.qty);
         return !seenInwardSignatures.has(sig);
    });

    // 3. UPLOAD NEW DATA
    // Masters
    if (unsyncedVendors.length) await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.vendorSheetName}!A:B`,
      valueInputOption: "USER_ENTERED", resource: { values: unsyncedVendors.map(v => [v.name, v.code]) }
    });
    if (unsyncedItems.length) await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.itemSheetName}!A:B`,
      valueInputOption: "USER_ENTERED", resource: { values: unsyncedItems.map(i => [i.sku, i.description]) }
    });
    if (unsyncedWorks.length) await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.workSheetName}!A:A`,
      valueInputOption: "USER_ENTERED", resource: { values: unsyncedWorks.map(w => [w.name]) }
    });
    if (unsyncedUsers.length) await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.userSheetName}!A:A`,
      valueInputOption: "USER_ENTERED", resource: { values: unsyncedUsers.map(u => [u.name]) }
    });

    // Upload Outward
    const newOutwardRows: any[] = [];
    for (const e of validOutwardToUpload) {
      let photoUrl = e.photoUrl || '';
      if (e.photo && !photoUrl) {
        const url = await uploadImage(e.photo, `OUT_${e.challanNo}_${e.date.split('T')[0]}.jpg`);
        if (url) photoUrl = url;
      }
      const vendor = state.vendors.find(v => v.id === e.vendorId)?.name || 'Unknown';
      const item = state.items.find(i => i.id === e.skuId)?.sku || 'Unknown';
      const work = state.workTypes.find(w => w.id === e.workId)?.name || '';

      newOutwardRows.push([
        e.date.split('T')[0], vendor, e.challanNo, item, e.qty, e.comboQty || '', 
        e.totalWeight, e.pendalWeight, e.materialWeight, 
        e.checkedBy || '', e.enteredBy || '', photoUrl, work, e.remarks || '',
        e.status || 'OPEN' 
      ]);
    }
    if (newOutwardRows.length) await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.outwardSheetName}!A:O`,
        valueInputOption: "USER_ENTERED", resource: { values: newOutwardRows }
    });

    // Upload Inward
    const newInwardRows: any[] = [];
    for (const e of validInwardToUpload) {
      let photoUrl = e.photoUrl || '';
      if (e.photo && !photoUrl) {
        const outChallan = state.outwardEntries.find(o => o.id === e.outwardChallanId)?.challanNo || 'UNK';
        const url = await uploadImage(e.photo, `IN_${outChallan}_${e.date.split('T')[0]}.jpg`);
        if (url) photoUrl = url;
      }
      const out = state.outwardEntries.find(o => o.id === e.outwardChallanId);
      const item = state.items.find(i => i.id === e.skuId)?.sku || 'Unknown';
      const vendor = state.vendors.find(v => v.id === e.vendorId)?.name || 'Unknown';
      
      newInwardRows.push([
        e.date.split('T')[0], vendor, out ? out.challanNo : '---', item, e.qty, e.comboQty || '',
        e.totalWeight, e.pendalWeight, e.materialWeight,
        e.checkedBy || '', e.enteredBy || '', photoUrl, e.remarks || ''
      ]);
    }
    if (newInwardRows.length) await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.inwardSheetName}!A:M`,
        valueInputOption: "USER_ENTERED", resource: { values: newInwardRows }
    });

    // 4. CONSTRUCT FINAL STATE (Merge Existing + Just Uploaded)
    
    // Masters
    const allVendors = [...existingVendors, ...unsyncedVendors.map(v => ({...v, synced: true, id: uuidv4()}))];
    const allItems = [...existingItems, ...unsyncedItems.map(v => ({...v, synced: true, id: uuidv4()}))];
    const allWorks = [...existingWorks, ...unsyncedWorks.map(v => ({...v, synced: true, id: uuidv4()}))];
    const allUsers = [...existingUsers, ...unsyncedUsers.map(v => ({...v, synced: true, id: uuidv4()}))];

    // Combine Entries (Raw Arrays)
    const allOutwardRows = [...existingOutwardRows, ...newOutwardRows];
    const allInwardRows = [...existingInwardRows, ...newInwardRows];

    // Helper finders
    const findId = (list: any[], name: string) => list.find((x: any) => x.name?.trim().toLowerCase() === name?.trim().toLowerCase())?.id || '';
    const findItemId = (list: any[], sku: string) => list.find((x: any) => x.sku?.trim().toLowerCase() === sku?.trim().toLowerCase())?.id || '';

    // Map Final Outward
    const seenChallansFinal = new Set<string>();
    const finalOutward: OutwardEntry[] = [];
    
    allOutwardRows.forEach((r:any) => {
       const challanNo = r[2];
       if (challanNo && !seenChallansFinal.has(challanNo)) {
           seenChallansFinal.add(challanNo);
           finalOutward.push({
              id: uuidv4(),
              date: parseDate(r[0]),
              vendorId: findId(allVendors, r[1]),
              challanNo: challanNo,
              skuId: findItemId(allItems, r[3]),
              qty: parseFloat(r[4] || 0),
              comboQty: parseFloat(r[5] || 0),
              totalWeight: parseFloat(r[6] || 0),
              pendalWeight: parseFloat(r[7] || 0),
              materialWeight: parseFloat(r[8] || 0),
              checkedBy: r[9] || '',
              enteredBy: r[10] || '',
              photoUrl: r[11] || '',
              workId: findId(allWorks, r[12]),
              remarks: r[13] || '',
              status: (r[14] as 'OPEN' | 'COMPLETED') || 'OPEN',
              synced: true
           });
       }
    });

    // Map Final Inward
    const finalInward: InwardEntry[] = allInwardRows.map((r:any) => {
      const outChallan = finalOutward.find((o: any) => o.challanNo === r[2]);
      return {
        id: uuidv4(),
        date: parseDate(r[0]),
        vendorId: findId(allVendors, r[1]),
        outwardChallanId: outChallan?.id || '',
        skuId: findItemId(allItems, r[3]),
        qty: parseFloat(r[4] || 0),
        comboQty: parseFloat(r[5] || 0),
        totalWeight: parseFloat(r[6] || 0),
        pendalWeight: parseFloat(r[7] || 0),
        materialWeight: parseFloat(r[8] || 0),
        checkedBy: r[9] || '',
        enteredBy: r[10] || '',
        photoUrl: r[11] || '',
        remarks: r[12] || '',
        synced: true
      };
    });

    // Update App State
    onUpdateState({
      vendors: allVendors,
      items: allItems,
      workTypes: allWorks,
      users: allUsers,
      outwardEntries: finalOutward,
      inwardEntries: finalInward
    });

    // 5. UPDATE RECONCILIATION REPORT
    // Use the guaranteed complete data (finalOutward/finalInward)
    const reportRows = finalOutward.map((out: OutwardEntry) => {
      const inwards = finalInward.filter((i: InwardEntry) => i.outwardChallanId === out.id);
      const inQty = inwards.reduce((sum: number, i: InwardEntry) => sum + i.qty, 0);
      const inCombo = inwards.reduce((sum: number, i: InwardEntry) => sum + (i.comboQty || 0), 0);
      const lastRecv = inwards.length ? inwards.map((i: InwardEntry) => i.date).sort().pop() : null;
      
      const shortQty = out.qty - inQty;
      const shortCombo = (out.comboQty || 0) - inCombo;

      let status = 'Pending';
      if (out.status === 'COMPLETED') {
          status = shortQty > 0 ? 'Short Qty Completed' : 'Completed';
      } else if (shortQty <= 0) {
          status = 'Completed';
      }

      const inwardCheckedBy = Array.from(new Set(inwards.map((i: InwardEntry) => i.checkedBy).filter(Boolean))).join(', ');
      const inwardEnteredBy = Array.from(new Set(inwards.map((i: InwardEntry) => i.enteredBy).filter(Boolean))).join(', ');
      const inwardRemarks = Array.from(new Set(inwards.map((i: InwardEntry) => i.remarks).filter(Boolean))).join(', ');

      return [
          status, // A
          allVendors.find((v: Vendor) => v.id === out.vendorId)?.name || '', // B
          out.date.split('T')[0], // C
          lastRecv ? parseDate(lastRecv).split('T')[0] : '---', // D
          out.challanNo, // E
          allItems.find((i: Item) => i.id === out.skuId)?.sku || '', // F
          out.qty, // G
          inQty, // H
          shortQty, // I
          out.comboQty || 0, // J
          inCombo, // K
          shortCombo, // L
          inwardEnteredBy, // M
          inwardCheckedBy, // N
          inwardRemarks, // O
          out.checkedBy || '', // P
          out.remarks || '' // Q
      ];
    });

    // Clear and Rewrite Report
    await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: SHEETS_CONFIG.spreadsheetId,
        range: `${SHEETS_CONFIG.reconciliationSheetName}!A2:Q`
    });

    if (reportRows.length > 0) {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SHEETS_CONFIG.spreadsheetId,
            range: `${SHEETS_CONFIG.reconciliationSheetName}!A2`,
            valueInputOption: "USER_ENTERED",
            resource: { values: reportRows }
        });
    }

    return { success: true, message: `Synced. Uploaded: ${newOutwardRows.length} Out, ${newInwardRows.length} In.` };
  } catch (error: any) {
    console.error("Sync Error", error);
    if (error.status === 400 && error.result?.error?.message?.includes("origin")) {
        return { success: false, message: "ORIGIN MISMATCH: Add this URL to Google Cloud Console > Authorized Origins" };
    }
    return { success: false, message: error.result?.error?.message || error.message || "Sync failed" };
  }
};