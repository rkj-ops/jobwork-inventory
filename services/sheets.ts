import { SHEETS_CONFIG, DRIVE_CONFIG, AppState } from '../types';
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

    const findId = (list: any[], name: string) => list.find(x => x.name?.trim().toLowerCase() === name?.trim().toLowerCase())?.id || '';
    const findItemId = (list: any[], sku: string) => list.find(x => x.sku?.trim().toLowerCase() === sku?.trim().toLowerCase())?.id || '';

    const newVendors = (valueRanges[0].values || []).map((r:any) => ({ id: uuidv4(), name: r[0], code: r[1], synced: true }));
    const newItems = (valueRanges[1].values || []).map((r:any) => ({ id: uuidv4(), sku: r[0], description: r[1] || '', synced: true }));
    const newWorks = (valueRanges[2].values || []).map((r:any) => ({ id: uuidv4(), name: r[0], synced: true }));

    const newOutward = (valueRanges[3].values || []).map((r:any) => ({
      id: uuidv4(),
      date: r[0] ? new Date(r[0]).toISOString() : new Date().toISOString(),
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
      status: r[14] || 'OPEN', // Load Status
      synced: true
    }));

    const newInward = (valueRanges[4].values || []).map((r:any) => {
      const outChallan = newOutward.find((o: any) => o.challanNo === r[2]);
      return {
        id: uuidv4(),
        date: r[0] ? new Date(r[0]).toISOString() : new Date().toISOString(),
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

    return { success: true, message: "Synced & Downloaded Successfully" };
  } catch (error: any) {
    console.error("Sync Error", error);
    if (error.status === 400 && error.result?.error?.message?.includes("origin")) {
        return { success: false, message: "ORIGIN MISMATCH: Add this URL to Google Cloud Console > Authorized Origins" };
    }
    return { success: false, message: error.result?.error?.message || error.message || "Sync failed" };
  }
};