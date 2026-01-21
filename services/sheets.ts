import { SHEETS_CONFIG, DRIVE_CONFIG, AppState, Vendor, Item, WorkType, User, OutwardEntry, InwardEntry, formatDisplayDate } from '../types';
import { v4 as uuidv4 } from 'uuid';

export const compressImage = async (input: File | string, maxWidth = 800, quality = 0.6): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    let objectUrl: string | null = null;

    if (input instanceof File) {
      objectUrl = URL.createObjectURL(input);
      img.src = objectUrl;
    } else {
      img.src = input;
    }

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
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
        ctx.fillStyle = "#FFFFFF"; // Ensure white background for transparent PNGs
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        // Returns a much smaller Base64 string
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } else {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        resolve(input instanceof File ? '' : input);
      }
    };

    img.onerror = (e) => {
      console.warn("Compression failed, returning empty.", e);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(typeof input === 'string' ? input : '');
    };
  });
};

const dataURLToBlob = (dataUrl: string): Blob => {
  try {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    console.error("Blob conversion failed", e);
    // Return a minimal valid blob to prevent fetch crashes, though upload will be empty
    return new Blob([''], { type: 'application/octet-stream' });
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
  const accessToken = gapi.client.getToken()?.access_token;
  if (!accessToken) return null;

  // 1. Try finding/creating in the specific configured folder (Shared Folder scenario)
  try {
    const query = `name='${folderName}' and '${DRIVE_CONFIG.folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;
    }

    // Try creating in configured folder
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [DRIVE_CONFIG.folderId] })
    });
    
    if (createResponse.ok) {
        const createData = await createResponse.json();
        return createData.id;
    }
  } catch (e) { 
     console.warn("Could not access configured folder, falling back to root.");
  }

  // 2. Fallback: Find/Create in User's Root Drive if configured folder failed (Permission denied etc)
  try {
     const rootQuery = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
     const rootSearch = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(rootQuery)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
     );
     if (rootSearch.ok) {
         const d = await rootSearch.json();
         if (d.files && d.files.length > 0) return d.files[0].id;
     }
     
     // Create in root
     const rootCreate = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' })
     });
     if (rootCreate.ok) {
         const d = await rootCreate.json();
         return d.id;
     }
  } catch (e) {
      console.error("Root folder fallback failed", e);
  }

  return null; 
};

const uploadImage = async (base64String: string, fileName: string, targetFolder: 'outward' | 'inward'): Promise<string | null> => {
  if (!base64String || !base64String.includes(',')) return null;

  const gapi = (window as any).gapi;
  const accessToken = gapi.client.getToken()?.access_token;
  if (!accessToken) {
      console.error("Upload failed: No access token");
      return null;
  }

  try {
    const blob = dataURLToBlob(base64String);
    if (blob.size < 100) {
        console.error("Upload failed: Invalid blob size");
        return null;
    }
    
    // Resolve Folder - Dynamic based on target
    const folderName = targetFolder === 'outward' ? 'Outward Images' : 'Inward Images';
    const folderId = await getOrCreateFolder(folderName);
    
    // Metadata
    const metadata = { 
        name: fileName, 
        parents: folderId ? [folderId] : [], // If no folder found, upload to root
        mimeType: 'image/jpeg'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    let attempts = 0;
    while (attempts < 3) {
        try {
            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
                method: 'POST',
                headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
                body: form
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log(`Uploaded ${fileName} to ${data.webViewLink}`);
                return data.webViewLink || null;
            } else {
               const errText = await response.text();
               console.warn(`Upload fail ${response.status}: ${errText}`);
            }
        } catch (netErr) {
            console.warn(`Upload network error attempt ${attempts + 1}`, netErr);
        }
        attempts++;
        await delay(1000 * attempts);
    }
    return null;
  } catch (error) { 
    console.error("Drive upload fatal error:", error);
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

const normalizeDate = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toISOString().split('T')[0];
};

const getInwardSignature = (dateStr: string, vendor: string, outChallan: string, qty: number) => {
    return `${normalizeDate(dateStr)}|${vendor.trim().toLowerCase()}|${outChallan.trim().toLowerCase()}|${qty}`;
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

    // --- STATUS UPDATE SYNC ---
    const statusUpdates: any[] = [];
    existingOutwardRows.forEach((row: any, index: number) => {
        const challanNo = row[2];
        const localMatch = state.outwardEntries.find(o => o.challanNo === challanNo);
        const sheetStatus = row[14]; 
        
        if (localMatch && localMatch.status === 'COMPLETED' && sheetStatus !== 'COMPLETED') {
             const range = `${SHEETS_CONFIG.outwardSheetName}!O${index + 2}`;
             statusUpdates.push({ range, values: [['COMPLETED']] });
        }
    });

    if (statusUpdates.length > 0) {
        await gapi.client.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SHEETS_CONFIG.spreadsheetId,
            resource: { data: statusUpdates, valueInputOption: "USER_ENTERED" }
        });
    }

    const seenOutwardChallans = new Set(existingOutwardRows.map((r:any) => r[2]?.trim())); 
    const seenInwardSignatures = new Set(existingInwardRows.map((r:any) => 
        getInwardSignature(r[0]||'', r[1]||'', r[2]||'', parseFloat(r[4]||0))
    ));

    const unsyncedVendors = state.vendors.filter(e => !e.synced && !existingVendors.some(ev => ev.code === e.code));
    const unsyncedItems = state.items.filter(e => !e.synced && !existingItems.some(ei => ei.sku === e.sku));
    const unsyncedWorks = state.workTypes.filter(e => !e.synced && !existingWorks.some(ew => ew.name === e.name));
    const unsyncedUsers = state.users.filter(e => !e.synced && !existingUsers.some(eu => eu.name === e.name));
    
    // Filter unsynced, but DO NOT commit them yet if critical data (photo) fails to upload
    const candidatesOutward = state.outwardEntries.filter(e => !e.synced && !seenOutwardChallans.has(e.challanNo.trim()));
    const candidatesInward = state.inwardEntries.filter(e => !e.synced).filter(e => {
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
    const failedOutwards = new Set<string>();

    for (const e of candidatesOutward) {
      let pUrl = e.photoUrl;
      if (!pUrl && e.photo) {
          pUrl = await uploadImage(e.photo, `OUT_${e.challanNo}.jpg`, 'outward');
          // If upload fails explicitly (returns null), skip this entry to prevent data loss (keep it unsynced)
          if (pUrl === null) {
              console.error(`Skipping sync for ${e.challanNo}: Image upload failed.`);
              failedOutwards.add(e.id);
              continue; 
          }
          if (candidatesOutward.length > 1) await delay(800); 
      }
      
      newOutwardRows.push([
        formatDisplayDate(e.date), state.vendors.find(v => v.id === e.vendorId)?.name || 'Unknown',
        e.challanNo, state.items.find(i => i.id === e.skuId)?.sku || 'Unknown', 
        e.qty, e.comboQty || '', e.totalWeight, e.pendalWeight, e.materialWeight, 
        e.checkedBy || '', e.enteredBy || '', pUrl || '', 
        state.workTypes.find(w => w.id === e.workId)?.name || '', 
        e.remarks || '', e.status || 'OPEN', timestamp
      ]);
    }
    if (newOutwardRows.length) await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.outwardSheetName}!A:P`, valueInputOption: "USER_ENTERED", resource: { values: newOutwardRows } });

    const newInwardRows: any[] = [];
    const failedInwards = new Set<string>();

    for (const e of candidatesInward) {
      const out = state.outwardEntries.find(o => o.id === e.outwardChallanId);
      let pUrl = e.photoUrl;
      if (!pUrl && e.photo) {
          pUrl = await uploadImage(e.photo, `IN_${out?.challanNo || 'UNK'}.jpg`, 'inward');
          if (pUrl === null) {
             console.error(`Skipping sync for Inward ${e.id}: Image upload failed.`);
             failedInwards.add(e.id);
             continue;
          }
          if (candidatesInward.length > 1) await delay(800);
      }
      
      newInwardRows.push([
        formatDisplayDate(e.date), state.vendors.find(v => v.id === e.vendorId)?.name || 'Unknown',
        out ? out.challanNo : '---', state.items.find(i => i.id === e.skuId)?.sku || 'Unknown', 
        e.qty, e.comboQty || '', e.totalWeight, e.pendalWeight, e.materialWeight,
        e.checkedBy || '', e.enteredBy || '', pUrl || '', e.remarks || '', timestamp
      ]);
    }
    if (newInwardRows.length) await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.inwardSheetName}!A:N`, valueInputOption: "USER_ENTERED", resource: { values: newInwardRows } });

    // Merging Data:
    // We must keep entries that failed to sync as 'unsynced' in the new state
    const allVendors = [...existingVendors, ...unsyncedVendors.map(v => ({...v, synced: true}))];
    const allItems = [...existingItems, ...unsyncedItems.map(i => ({...i, synced: true}))];
    const allWorks = [...existingWorks, ...unsyncedWorks.map(w => ({...w, synced: true}))];
    const allUsers = [...existingUsers, ...unsyncedUsers.map(u => ({...u, synced: true}))];

    // Outward: Existing Sheet Data + New Rows + Failed (Local) Rows
    const finalOutward: OutwardEntry[] = [
        ...existingOutwardRows, 
        ...newOutwardRows
    ].map((r:any) => {
      const challanNo = r[2];
      const localMatch = state.outwardEntries.find(o => o.challanNo === challanNo);
      const statusFromSheet = r[14] as 'OPEN' | 'COMPLETED';
      const effectiveStatus = (localMatch?.status === 'COMPLETED' || statusFromSheet === 'COMPLETED') ? 'COMPLETED' : 'OPEN';

      return {
        id: localMatch?.id || uuidv4(), date: parseDate(r[0]), 
        vendorId: allVendors.find(v => v.name === r[1])?.id || '',
        challanNo: challanNo, skuId: allItems.find(i => i.sku === r[3])?.id || '',
        qty: parseFloat(r[4] || 0), comboQty: parseFloat(r[5] || 0),
        totalWeight: parseFloat(r[6] || 0), pendalWeight: parseFloat(r[7] || 0), materialWeight: parseFloat(r[8] || 0),
        checkedBy: r[9] || '', enteredBy: r[10] || '', photoUrl: r[11] || undefined, workId: allWorks.find(w => w.name === r[12])?.id || '',
        remarks: r[13], status: effectiveStatus, synced: true
      };
    });
    
    // Add back the failed entries (preserving their local state and unsynced status)
    candidatesOutward.forEach(e => {
        if (failedOutwards.has(e.id)) {
            finalOutward.push({ ...e, synced: false });
        }
    });

    // Inward:
    const finalInward: InwardEntry[] = [
        ...existingInwardRows, 
        ...newInwardRows
    ].map((r:any) => {
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
        checkedBy: r[9] || '', enteredBy: r[10] || '', photoUrl: r[11] || undefined, remarks: r[12], synced: true
      };
    });
    
    candidatesInward.forEach(e => {
        if (failedInwards.has(e.id)) {
            finalInward.push({ ...e, synced: false });
        }
    });

    // --- RECONCILIATION SHEET UPDATE ---
    const reconRows = finalOutward.map(o => {
        const ins = finalInward.filter(i => i.outwardChallanId === o.id);
        const inQty = ins.reduce((sum, i) => sum + i.qty, 0);
        const inCombo = ins.reduce((sum, i) => sum + (i.comboQty || 0), 0);
        const twRec = ins.reduce((sum, i) => sum + i.totalWeight, 0);
        
        const isMarkedClosed = o.status === 'COMPLETED';
        const isActuallyDone = inQty >= o.qty && o.qty > 0;
        
        let statusStr = 'Pending';
        if (isMarkedClosed) {
            statusStr = o.qty > inQty ? 'Short Closed' : 'Completed';
        } else if (isActuallyDone) {
            statusStr = 'Completed';
        }

        const recvDatesStr = Array.from(new Set(ins.map(i => normalizeDate(i.date))))
            .sort().map(d => formatDisplayDate(d)).join('; ');

        const inwardChecked = Array.from(new Set(ins.map(i => i.checkedBy).filter(Boolean))).join('; ');
        const inwardEntered = Array.from(new Set(ins.map(i => i.enteredBy).filter(Boolean))).join('; ');
        const inwardRemarks = ins.map(i => i.remarks).filter(Boolean).join(' | ');

        const vendorName = allVendors.find(v => v.id === o.vendorId)?.name || 'Unknown';
        const workName = allWorks.find(w => w.id === o.workId)?.name || '';
        const skuName = allItems.find(i => i.id === o.skuId)?.sku || 'Unknown';

        return [
            statusStr, 
            vendorName,
            formatDisplayDate(o.date),
            recvDatesStr || '---',
            o.challanNo,
            workName,
            skuName,
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
            inwardEntered || '---',
            inwardRemarks || '---',
            o.checkedBy || '---',
            o.enteredBy || '---',
            o.remarks || '---'
        ];
    });

    if (reconRows.length) {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SHEETS_CONFIG.spreadsheetId, 
            range: `${SHEETS_CONFIG.reconciliationSheetName}!A2:V${reconRows.length + 1}`,
            valueInputOption: "USER_ENTERED", 
            resource: { values: reconRows }
        });
    }

    onUpdateState({ vendors: allVendors, items: allItems, workTypes: allWorks, users: allUsers, outwardEntries: finalOutward, inwardEntries: finalInward });
    
    if (failedOutwards.size > 0 || failedInwards.size > 0) {
        return { success: false, message: `Synced with errors. ${failedOutwards.size + failedInwards.size} images failed to upload. Retrying automatically next time.` };
    }
    
    return { success: true, message: `Sync Complete: ${timestamp}` };
  } catch (error: any) { 
    console.error("Sync Process Error:", error);
    return { success: false, message: error.message || "Sync failed" }; 
  }
};