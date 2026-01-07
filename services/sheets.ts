import { SHEETS_CONFIG, DRIVE_CONFIG, AppState, Vendor, Item, WorkType, OutwardEntry, InwardEntry } from '../types';
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
    const gapi = (window as any).gapi;
    const byteString = atob(base64String.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: 'image/jpeg' });
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
    const data = await response.json();
    return data.webViewLink || null;
  } catch (error) { console.error("Drive Upload Error", error); return null; }
};

// Helper to safely parse dates from sheets (handles various formats)
const parseDate = (value: any): string => {
  if (!value) return new Date().toISOString();
  
  let d = new Date(value);
  
  // If standard parsing fails, check for DD/MM/YYYY or DD-MM-YYYY (Common in sheets)
  if (isNaN(d.getTime())) {
    const match = String(value).trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (match) {
        // match[1] = DD, match[2] = MM, match[3] = YYYY
        // Construct YYYY-MM-DD which is ISO compliant
        d = new Date(`${match[3]}-${match[2]}-${match[1]}`);
    }
  }

  // If still invalid, fallback to now to prevent app crash
  if (isNaN(d.getTime())) {
    console.warn("Sync: Invalid Date found:", value, "- using current date");
    return new Date().toISOString();
  }
  
  return d.toISOString();
};

export const syncDataToSheets = async (state: AppState, onUpdateState: (newState: AppState) => void) => {
  const gapi = (window as any).gapi;
  
  if (!gapi.client.getToken()) {
    return { success: false, message: "Authorization lost. Click Sync to login again." };
  }
  
  const unsyncedOut = state.outwardEntries.filter(e => !e.synced);
  const unsyncedIn = state.inwardEntries.filter(e => !e.synced);
  const unsyncedVendors = state.vendors.filter(e => !e.synced);
  const unsyncedItems = state.items.filter(e => !e.synced);
  const unsyncedWorks = state.workTypes.filter(e => !e.synced);

  try {
    // Sync Masters
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

    // Sync Outward
    if (unsyncedOut.length) {
      const rows = [];
      for (const e of unsyncedOut) {
        let photoUrl = e.photoUrl || '';
        if (e.photo && !photoUrl) {
          const url = await uploadImage(e.photo, `OUT_${e.challanNo}_${e.date.split('T')[0]}.jpg`);
          if (url) photoUrl = url;
        }
        const vendor = state.vendors.find(v => v.id === e.vendorId)?.name || 'Unknown';
        const item = state.items.find(i => i.id === e.skuId)?.sku || 'Unknown';
        const work = state.workTypes.find(w => w.id === e.workId)?.name || '';

        // Added Status at index 14 (O)
        rows.push([
          e.date.split('T')[0], vendor, e.challanNo, item, e.qty, e.comboQty || '', 
          e.totalWeight, e.pendalWeight, e.materialWeight, 
          e.checkedBy || '', e.enteredBy || '', photoUrl, work, e.remarks || '',
          e.status || 'OPEN' 
        ]);
      }
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.outwardSheetName}!A:O`,
        valueInputOption: "USER_ENTERED", resource: { values: rows }
      });
    }

    // Sync Inward
    if (unsyncedIn.length) {
      const rows = [];
      for (const e of unsyncedIn) {
        let photoUrl = e.photoUrl || '';
        if (e.photo && !photoUrl) {
          const outChallan = state.outwardEntries.find(o => o.id === e.outwardChallanId)?.challanNo || 'UNK';
          const url = await uploadImage(e.photo, `IN_${outChallan}_${e.date.split('T')[0]}.jpg`);
          if (url) photoUrl = url;
        }
        const out = state.outwardEntries.find(o => o.id === e.outwardChallanId);
        const item = state.items.find(i => i.id === e.skuId)?.sku || 'Unknown';
        const vendor = state.vendors.find(v => v.id === e.vendorId)?.name || 'Unknown';
        
        rows.push([
          e.date.split('T')[0], vendor, out ? out.challanNo : '---', item, e.qty, e.comboQty || '',
          e.totalWeight, e.pendalWeight, e.materialWeight,
          e.checkedBy || '', e.enteredBy || '', photoUrl, e.remarks || ''
        ]);
      }
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.inwardSheetName}!A:M`,
        valueInputOption: "USER_ENTERED", resource: { values: rows }
      });
    }

    // 2. PULL: Download ALL data
    const ranges = [
      `${SHEETS_CONFIG.vendorSheetName}!A:B`,
      `${SHEETS_CONFIG.itemSheetName}!A:B`,
      `${SHEETS_CONFIG.workSheetName}!A:A`,
      `${SHEETS_CONFIG.outwardSheetName}!A:O`, // Extended Range for Status
      `${SHEETS_CONFIG.inwardSheetName}!A:M`
    ];
    const resp = await gapi.client.sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, ranges });
    const valueRanges = resp.result.valueRanges;

    const findId = (list: any[], name: string) => list.find((x: any) => x.name?.trim().toLowerCase() === name?.trim().toLowerCase())?.id || '';
    const findItemId = (list: any[], sku: string) => list.find((x: any) => x.sku?.trim().toLowerCase() === sku?.trim().toLowerCase())?.id || '';

    const newVendors: Vendor[] = (valueRanges[0].values || []).map((r:any) => ({ id: uuidv4(), name: r[0], code: r[1], synced: true }));
    const newItems: Item[] = (valueRanges[1].values || []).map((r:any) => ({ id: uuidv4(), sku: r[0], description: r[1] || '', synced: true }));
    const newWorks: WorkType[] = (valueRanges[2].values || []).map((r:any) => ({ id: uuidv4(), name: r[0], synced: true }));

    const newOutward: OutwardEntry[] = (valueRanges[3].values || []).map((r:any) => ({
      id: uuidv4(),
      date: parseDate(r[0]),
      vendorId: findId(newVendors, r[1]),
      challanNo: r[2],
      skuId: findItemId(newItems, r[3]),
      qty: parseFloat(r[4] || 0),
      comboQty: parseFloat(r[5] || 0),
      totalWeight: parseFloat(r[6] || 0),
      pendalWeight: parseFloat(r[7] || 0),
      materialWeight: parseFloat(r[8] || 0),
      checkedBy: r[9] || '',
      enteredBy: r[10] || '',
      photoUrl: r[11] || '',
      workId: findId(newWorks, r[12]),
      remarks: r[13] || '',
      status: (r[14] as 'OPEN' | 'COMPLETED') || 'OPEN', // Load Status
      synced: true
    }));

    const newInward: InwardEntry[] = (valueRanges[4].values || []).map((r:any) => {
      const outChallan = newOutward.find((o: any) => o.challanNo === r[2]);
      return {
        id: uuidv4(),
        date: parseDate(r[0]),
        vendorId: findId(newVendors, r[1]),
        outwardChallanId: outChallan?.id || '',
        skuId: findItemId(newItems, r[3]),
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

    onUpdateState({
      vendors: newVendors,
      items: newItems,
      workTypes: newWorks,
      outwardEntries: newOutward,
      inwardEntries: newInward
    });

    // --- RECONCILIATION REPORT SYNC ---
    try {
      const reportRows = newOutward.map((out: OutwardEntry) => {
        const inwards = newInward.filter((i: InwardEntry) => i.outwardChallanId === out.id);
        const inQty = inwards.reduce((sum: number, i: InwardEntry) => sum + i.qty, 0);
        const inCombo = inwards.reduce((sum: number, i: InwardEntry) => sum + (i.comboQty || 0), 0);
        // Get latest inward date
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
        const inwardRemarks = Array.from(new Set(inwards.map((i: InwardEntry) => i.remarks).filter(Boolean))).join(', ');

        return [
            status, // A
            newVendors.find((v: Vendor) => v.id === out.vendorId)?.name || '', // B
            out.date.split('T')[0], // C
            lastRecv ? lastRecv.split('T')[0] : '---', // D
            out.challanNo, // E
            newItems.find((i: Item) => i.id === out.skuId)?.sku || '', // F
            out.qty, // G
            inQty, // H
            shortQty, // I
            out.comboQty || 0, // J
            inCombo, // K
            shortCombo, // L
            inwardCheckedBy, // M
            inwardRemarks, // N
            out.checkedBy || '', // O
            out.remarks || '' // P
        ];
      });

      // Clear existing report data (A2:P)
      await gapi.client.sheets.spreadsheets.values.clear({
          spreadsheetId: SHEETS_CONFIG.spreadsheetId,
          range: `${SHEETS_CONFIG.reconciliationSheetName}!A2:P`
      });

      // Write new report data
      if (reportRows.length > 0) {
          await gapi.client.sheets.spreadsheets.values.update({
              spreadsheetId: SHEETS_CONFIG.spreadsheetId,
              range: `${SHEETS_CONFIG.reconciliationSheetName}!A2`,
              valueInputOption: "USER_ENTERED",
              resource: { values: reportRows }
          });
      }
    } catch (err) {
      console.error("Reconciliation Sync Failed (Optional)", err);
      // Don't block main sync success if just the report fails (e.g. sheet doesn't exist)
    }
    // ----------------------------------

    return { success: true, message: "Synced, Downloaded & Report Updated" };
  } catch (error: any) {
    console.error("Sync Error", error);
    if (error.status === 400 && error.result?.error?.message?.includes("origin")) {
        return { success: false, message: "ORIGIN MISMATCH: Add this URL to Google Cloud Console > Authorized Origins" };
    }
    return { success: false, message: error.result?.error?.message || error.message || "Sync failed" };
  }
};