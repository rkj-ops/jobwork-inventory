import { SHEETS_CONFIG, DRIVE_CONFIG, AppState, Vendor, Item, WorkType, User, OutwardEntry, InwardEntry, formatDisplayDate } from '../types';
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

const getOrCreateFolder = async (folderName: string): Promise<string | null> => {
  const gapi = (window as any).gapi;
  const accessToken = gapi.client.getToken()?.access_token;
  if (!accessToken) return null;

  try {
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and '${DRIVE_CONFIG.folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchResponse.json();
    if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [DRIVE_CONFIG.folderId] })
    });
    const createData = await createResponse.json();
    return createData.id || null;
  } catch (e) { return DRIVE_CONFIG.folderId; }
};

const uploadImage = async (base64String: string, fileName: string, targetFolder: 'outward' | 'inward'): Promise<string | null> => {
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
    const folderId = await getOrCreateFolder(targetFolder === 'outward' ? 'outward images' : 'inward images');
    const metadata = { name: fileName, parents: folderId ? [folderId] : [DRIVE_CONFIG.folderId] };
    const accessToken = gapi.client.getToken()?.access_token;
    if (!accessToken) throw new Error("No Access Token");
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
  } catch (error) { return null; }
};

const parseDate = (value: any): string => {
  try {
    if (!value) return new Date().toISOString();
    let d = new Date(value);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch (e) { return new Date().toISOString(); }
};

const getInwardSignature = (dateStr: string, vendor: string, outChallan: string, qty: number) => {
    const d = dateStr.split('T')[0];
    return `${d}|${vendor.trim().toLowerCase()}|${outChallan.trim().toLowerCase()}|${qty}`;
};

export const syncDataToSheets = async (state: AppState, onUpdateState: (newState: AppState) => void) => {
  const gapi = (window as any).gapi;
  if (!gapi.client.getToken()) return { success: false, message: "Authorization lost." };

  try {
    const timestamp = new Date().toLocaleString();
    const ranges = [
      `${SHEETS_CONFIG.vendorSheetName}!A:B`,
      `${SHEETS_CONFIG.itemSheetName}!A:B`,
      `${SHEETS_CONFIG.workSheetName}!A:A`,
      `${SHEETS_CONFIG.outwardSheetName}!A:P`, 
      `${SHEETS_CONFIG.inwardSheetName}!A:N`, 
      `${SHEETS_CONFIG.userSheetName}!A:A`
    ];
    const resp = await gapi.client.sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, ranges });
    const valueRanges = resp.result.valueRanges;

    const existingVendors: Vendor[] = (valueRanges[0].values || []).slice(1).map((r:any) => ({ id: uuidv4(), name: r[0], code: r[1], synced: true }));
    const existingItems: Item[] = (valueRanges[1].values || []).slice(1).map((r:any) => ({ id: uuidv4(), sku: r[0], description: r[1] || '', synced: true }));
    const existingWorks: WorkType[] = (valueRanges[2].values || []).slice(1).map((r:any) => ({ id: uuidv4(), name: r[0], synced: true }));
    const existingUsers: User[] = (valueRanges[5].values || []).slice(1).map((r:any) => ({ id: uuidv4(), name: r[0], synced: true }));
    
    const existingOutwardRows = (valueRanges[3].values || []).slice(1);
    const existingInwardRows = (valueRanges[4].values || []).slice(1);

    const seenOutwardChallans = new Set(existingOutwardRows.map((r:any) => r[2]?.trim())); 
    const seenInwardSignatures = new Set(existingInwardRows.map((r:any) => 
        getInwardSignature(r[0]||'', r[1]||'', r[2]||'', parseFloat(r[4]||0))
    ));

    const unsyncedVendors = state.vendors.filter(e => !e.synced && !existingVendors.some(ev => ev.code === e.code));
    const unsyncedItems = state.items.filter(e => !e.synced && !existingItems.some(ei => ei.sku === e.sku));
    const unsyncedWorks = state.workTypes.filter(e => !e.synced && !existingWorks.some(ew => ew.name === e.name));
    const unsyncedUsers = state.users.filter(e => !e.synced && !existingUsers.some(eu => eu.name === e.name));
    
    const validOutwardToUpload = state.outwardEntries.filter(e => !e.synced && !seenOutwardChallans.has(e.challanNo.trim()));
    const validInwardToUpload = state.inwardEntries.filter(e => !e.synced).filter(e => {
         const vendorName = state.vendors.find(v => v.id === e.vendorId)?.name || 'Unknown';
         const outChallan = state.outwardEntries.find(o => o.id === e.outwardChallanId)?.challanNo || '---';
         const sig = getInwardSignature(e.date, vendorName, outChallan, e.qty);
         return !seenInwardSignatures.has(sig);
    });

    if (unsyncedVendors.length) await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.vendorSheetName}!A:B`, valueInputOption: "USER_ENTERED", resource: { values: unsyncedVendors.map(v => [v.name, v.code]) } });
    if (unsyncedItems.length) await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.itemSheetName}!A:B`, valueInputOption: "USER_ENTERED", resource: { values: unsyncedItems.map(i => [i.sku, i.description]) } });
    if (unsyncedWorks.length) await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.workSheetName}!A:A`, valueInputOption: "USER_ENTERED", resource: { values: unsyncedWorks.map(w => [w.name]) } });
    if (unsyncedUsers.length) await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.userSheetName}!A:A`, valueInputOption: "USER_ENTERED", resource: { values: unsyncedUsers.map(u => [u.name]) } });

    const newOutwardRows: any[] = [];
    for (const e of validOutwardToUpload) {
      let pUrl = e.photoUrl || (e.photo ? await uploadImage(e.photo, `OUT_${e.challanNo}.jpg`, 'outward') : '');
      newOutwardRows.push([
        formatDisplayDate(e.date), state.vendors.find(v => v.id === e.vendorId)?.name || 'Unknown',
        e.challanNo, state.items.find(i => i.id === e.skuId)?.sku || 'Unknown', 
        e.qty, e.comboQty || '', e.totalWeight, e.pendalWeight, e.materialWeight, 
        e.checkedBy || '', e.enteredBy || '', pUrl, 
        state.workTypes.find(w => w.id === e.workId)?.name || '', 
        e.remarks || '', 'OPEN', timestamp
      ]);
    }
    if (newOutwardRows.length) await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.outwardSheetName}!A:P`, valueInputOption: "USER_ENTERED", resource: { values: newOutwardRows } });

    const newInwardRows: any[] = [];
    for (const e of validInwardToUpload) {
      const out = state.outwardEntries.find(o => o.id === e.outwardChallanId);
      let pUrl = e.photoUrl || (e.photo ? await uploadImage(e.photo, `IN_${out?.challanNo || 'UNK'}.jpg`, 'inward') : '');
      newInwardRows.push([
        formatDisplayDate(e.date), state.vendors.find(v => v.id === e.vendorId)?.name || 'Unknown',
        out ? out.challanNo : '---', state.items.find(i => i.id === e.skuId)?.sku || 'Unknown', 
        e.qty, e.comboQty || '', e.totalWeight, e.pendalWeight, e.materialWeight,
        e.checkedBy || '', e.enteredBy || '', pUrl, e.remarks || '', timestamp
      ]);
    }
    if (newInwardRows.length) await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.inwardSheetName}!A:N`, valueInputOption: "USER_ENTERED", resource: { values: newInwardRows } });

    const allVendors = [...existingVendors, ...unsyncedVendors.map(v => ({...v, synced: true}))];
    const allItems = [...existingItems, ...unsyncedItems.map(i => ({...i, synced: true}))];
    const allWorks = [...existingWorks, ...unsyncedWorks.map(w => ({...w, synced: true}))];
    const allUsers = [...existingUsers, ...unsyncedUsers.map(u => ({...u, synced: true}))];

    const finalOutward: OutwardEntry[] = [...existingOutwardRows, ...newOutwardRows].map((r:any) => ({
      id: uuidv4(), date: parseDate(r[0]), vendorId: allVendors.find(v => v.name === r[1])?.id || '',
      challanNo: r[2], skuId: allItems.find(i => i.sku === r[3])?.id || '',
      qty: parseFloat(r[4] || 0), comboQty: parseFloat(r[5] || 0),
      totalWeight: parseFloat(r[6] || 0), pendalWeight: parseFloat(r[7] || 0), materialWeight: parseFloat(r[8] || 0),
      checkedBy: r[9], enteredBy: r[10], photoUrl: r[11], workId: allWorks.find(w => w.name === r[12])?.id || '',
      remarks: r[13], status: r[14] as 'OPEN' | 'COMPLETED', synced: true
    }));

    const finalInward: InwardEntry[] = [...existingInwardRows, ...newInwardRows].map((r:any) => ({
      id: uuidv4(), date: parseDate(r[0]), vendorId: allVendors.find(v => v.name === r[1])?.id || '',
      outwardChallanId: finalOutward.find(o => o.challanNo === r[2])?.id || '',
      skuId: allItems.find(i => i.sku === r[3])?.id || '',
      qty: parseFloat(r[4] || 0), comboQty: parseFloat(r[5] || 0),
      totalWeight: parseFloat(r[6] || 0), pendalWeight: parseFloat(r[7] || 0), materialWeight: parseFloat(r[8] || 0),
      checkedBy: r[9], enteredBy: r[10], photoUrl: r[11], remarks: r[12], synced: true
    }));

    const reconRows = finalOutward.map(o => {
        const ins = finalInward.filter(i => i.outwardChallanId === o.id);
        const inQty = ins.reduce((s, i) => s + i.qty, 0);
        const inCombo = ins.reduce((s, i) => s + (i.comboQty || 0), 0);
        const twRec = ins.reduce((s, i) => s + i.totalWeight, 0);
        
        const isMarkedClosed = o.status === 'COMPLETED';
        const isActuallyDone = inQty >= o.qty && o.qty > 0;
        
        let statusStr = 'pending';
        if (isMarkedClosed) {
            statusStr = o.qty > inQty ? 'short qty completed' : 'complete';
        } else if (isActuallyDone) {
            statusStr = 'complete';
        }

        const recvDatesStr = Array.from(new Set(ins.map(i => i.date.split('T')[0])))
            .sort()
            .map(d => formatDisplayDate(d))
            .join('; ');

        const inwardChecked = Array.from(new Set(ins.map(i => i.checkedBy).filter(Boolean))).join('; ');
        const inwardRemarks = ins.map(i => i.remarks).filter(Boolean).join(' | ');

        // COLUMNS A-T Strictly
        return [
            statusStr,
            allVendors.find(v => v.id === o.vendorId)?.name || 'Unknown',
            formatDisplayDate(o.date),
            recvDatesStr || '---',
            o.challanNo,
            allWorks.find(w => w.id === o.workId)?.name || '',
            allItems.find(i => i.id === o.skuId)?.sku || 'Unknown',
            o.qty,
            inQty,
            Math.max(0, o.qty - inQty),
            o.comboQty || 0,
            inCombo,
            Math.max(0, (o.comboQty || 0) - inCombo),
            o.totalWeight,
            twRec,
            (o.totalWeight - twRec).toFixed(3),
            inwardChecked || '---',
            inwardRemarks || '---',
            o.checkedBy || '---',
            o.remarks || '---'
        ];
    });
    
    if (reconRows.length) {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.reconciliationSheetName}!A2:T${reconRows.length + 1}`,
            valueInputOption: "USER_ENTERED", resource: { values: reconRows }
        });
    }

    onUpdateState({ vendors: allVendors, items: allItems, workTypes: allWorks, users: allUsers, outwardEntries: finalOutward, inwardEntries: finalInward });
    return { success: true, message: `Sync Complete: ${timestamp}` };
  } catch (error: any) { return { success: false, message: error.message || "Sync failed" }; }
};