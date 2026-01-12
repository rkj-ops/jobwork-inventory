import { SHEETS_CONFIG, DRIVE_CONFIG, AppState, Vendor, Item, WorkType, User, OutwardEntry, InwardEntry, formatDisplayDate } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Highly optimized image compression for mobile devices.
 * Reduces image size to ~800px width to ensure successful upload over mobile data.
 */
export const compressImage = async (base64: string, maxWidth = 800, quality = 0.6): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width *= maxWidth / height;
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = "#FFFFFF"; // Ensure white background for transparent PNGs converted to JPEG
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(base64);
      }
    };
    img.onerror = (e) => {
      console.warn("Compression failed, using original.", e);
      resolve(base64);
    };
  });
};

const dataURLToBlob = async (dataUrl: string): Promise<Blob> => {
  try {
      const res = await fetch(dataUrl);
      return await res.blob();
  } catch (e) {
      // Fallback for older browsers
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while(n--){
          u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], {type:mime});
  }
};

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
      } catch (e) { 
        console.error("GAPI Init Error:", e);
        reject(e); 
      }
    });
  });
};

const getOrCreateFolder = async (folderName: string): Promise<string | null> => {
  const gapi = (window as any).gapi;
  // Always get a fresh token from the client if possible
  const accessToken = gapi.client.getToken()?.access_token;
  if (!accessToken) return null;

  try {
    // Try to find the specific folder inside the parent
    const query = `name='${folderName}' and '${DRIVE_CONFIG.folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;
    }

    // If not found, try to create it in the parent
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [DRIVE_CONFIG.folderId] })
    });
    
    if (createResponse.ok) {
        const createData = await createResponse.json();
        return createData.id;
    }
    
    // If creation fails (e.g. permission denied on parent), return null so we upload to root or handle gracefully
    console.warn("Could not create folder in specified parent. Defaulting to root or AppData.");
    return null;
  } catch (e) { 
    console.error("Folder creation error:", e);
    return null; 
  }
};

const uploadImage = async (base64String: string, fileName: string, targetFolder: 'outward' | 'inward'): Promise<string | null> => {
  try {
    if (!base64String || !base64String.includes(',')) return null;
    
    // Step 1: Compress
    const compressedBase64 = await compressImage(base64String);
    
    // Step 2: Blob
    const blob = await dataURLToBlob(compressedBase64);
    
    const gapi = (window as any).gapi;
    const accessToken = gapi.client.getToken()?.access_token;
    if (!accessToken) {
      console.error("No access token found for image upload");
      return null;
    }

    // Determine parent folder
    const specificFolderId = await getOrCreateFolder(targetFolder === 'outward' ? 'outward images' : 'inward images');
    // If we couldn't get the specific folder, try the main folder. If that fails, it goes to root (no parents).
    const parents = specificFolderId ? [specificFolderId] : (DRIVE_CONFIG.folderId ? [DRIVE_CONFIG.folderId] : []);
    
    const metadata = { 
        name: fileName, 
        parents: parents,
        mimeType: 'image/jpeg'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
      body: form
    });
    
    if (!response.ok) {
      const errorMsg = await response.text();
      console.error("Drive upload error response:", errorMsg);
      // Retry logic could go here, but for now just fail gracefully
      return null;
    }

    const data = await response.json();
    return data.webViewLink || null;
  } catch (error) { 
    console.error("Drive upload failed:", error);
    return null; 
  }
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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const syncDataToSheets = async (state: AppState, onUpdateState: (newState: AppState) => void) => {
  const gapi = (window as any).gapi;
  const accessToken = gapi.client.getToken()?.access_token;
  if (!accessToken) return { success: false, message: "Authorization required. Click Sync manually." };

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

    // UPLOAD DATA BATCH 1
    if (unsyncedVendors.length) await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.vendorSheetName}!A:B`, valueInputOption: "USER_ENTERED", resource: { values: unsyncedVendors.map(v => [v.name, v.code]) } });
    if (unsyncedItems.length) await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.itemSheetName}!A:B`, valueInputOption: "USER_ENTERED", resource: { values: unsyncedItems.map(i => [i.sku, i.description]) } });
    if (unsyncedWorks.length) await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.workSheetName}!A:A`, valueInputOption: "USER_ENTERED", resource: { values: unsyncedWorks.map(w => [w.name]) } });
    if (unsyncedUsers.length) await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.userSheetName}!A:A`, valueInputOption: "USER_ENTERED", resource: { values: unsyncedUsers.map(u => [u.name]) } });

    // UPLOAD IMAGES AND ROWS
    const newOutwardRows: any[] = [];
    for (const e of validOutwardToUpload) {
      let pUrl = e.photoUrl;
      // Retry upload if not present but photo data exists
      if (!pUrl && e.photo) {
          pUrl = await uploadImage(e.photo, `OUT_${e.challanNo}.jpg`, 'outward') || '';
          if (validOutwardToUpload.length > 1) await delay(500); // Throttling
      }
      
      newOutwardRows.push([
        formatDisplayDate(e.date), state.vendors.find(v => v.id === e.vendorId)?.name || 'Unknown',
        e.challanNo, state.items.find(i => i.id === e.skuId)?.sku || 'Unknown', 
        e.qty, e.comboQty || '', e.totalWeight, e.pendalWeight, e.materialWeight, 
        e.checkedBy || '', e.enteredBy || '', pUrl, 
        state.workTypes.find(w => w.id === e.workId)?.name || '', 
        e.remarks || '', e.status || 'OPEN', timestamp
      ]);
    }
    if (newOutwardRows.length) await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.outwardSheetName}!A:P`, valueInputOption: "USER_ENTERED", resource: { values: newOutwardRows } });

    const newInwardRows: any[] = [];
    for (const e of validInwardToUpload) {
      const out = state.outwardEntries.find(o => o.id === e.outwardChallanId);
      let pUrl = e.photoUrl;
      if (!pUrl && e.photo) {
          pUrl = await uploadImage(e.photo, `IN_${out?.challanNo || 'UNK'}.jpg`, 'inward') || '';
          if (validInwardToUpload.length > 1) await delay(500); // Throttling
      }
      
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

    const finalOutward: OutwardEntry[] = [...existingOutwardRows, ...newOutwardRows].map((r:any) => {
      const challanNo = r[2];
      const localMatch = state.outwardEntries.find(o => o.challanNo === challanNo);
      const statusFromSheet = r[14] as 'OPEN' | 'COMPLETED';
      const effectiveStatus = localMatch?.status === 'COMPLETED' ? 'COMPLETED' : statusFromSheet;

      return {
        id: localMatch?.id || uuidv4(), date: parseDate(r[0]), 
        vendorId: allVendors.find(v => v.name === r[1])?.id || '',
        challanNo: challanNo, skuId: allItems.find(i => i.sku === r[3])?.id || '',
        qty: parseFloat(r[4] || 0), comboQty: parseFloat(r[5] || 0),
        totalWeight: parseFloat(r[6] || 0), pendalWeight: parseFloat(r[7] || 0), materialWeight: parseFloat(r[8] || 0),
        checkedBy: r[9], enteredBy: r[10], photoUrl: r[11], workId: allWorks.find(w => w.name === r[12])?.id || '',
        remarks: r[13], status: effectiveStatus, synced: true
      };
    });

    const finalInward: InwardEntry[] = [...existingInwardRows, ...newInwardRows].map((r:any) => {
      const outChallan = r[2];
      const localMatch = state.inwardEntries.find(i => {
         const out = state.outwardEntries.find(o => o.id === i.outwardChallanId);
         return out?.challanNo === outChallan && i.qty === parseFloat(r[4]);
      });

      return {
        id: localMatch?.id || uuidv4(), date: parseDate(r[0]), 
        vendorId: allVendors.find(v => v.name === r[1])?.id || '',
        outwardChallanId: finalOutward.find(o => o.challanNo === outChallan)?.id || '',
        skuId: allItems.find(i => i.sku === r[3])?.id || '',
        qty: parseFloat(r[4] || 0), comboQty: parseFloat(r[5] || 0),
        totalWeight: parseFloat(r[6] || 0), pendalWeight: parseFloat(r[7] || 0), materialWeight: parseFloat(r[8] || 0),
        checkedBy: r[9], enteredBy: r[10], photoUrl: r[11], remarks: r[12], synced: true
      };
    });

    onUpdateState({ vendors: allVendors, items: allItems, workTypes: allWorks, users: allUsers, outwardEntries: finalOutward, inwardEntries: finalInward });
    return { success: true, message: `Sync Complete: ${timestamp}` };
  } catch (error: any) { 
    console.error("Sync Process Error:", error);
    return { success: false, message: error.message || "Sync failed" }; 
  }
};