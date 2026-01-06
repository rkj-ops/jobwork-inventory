import { SHEETS_CONFIG, DRIVE_CONFIG, AppState, OutwardEntry, InwardEntry } from '../types';

const SPREADSHEET_ID = SHEETS_CONFIG.spreadsheetId;
const DRIVE_FOLDER_ID = DRIVE_CONFIG.folderId;

export const initGapi = async (apiKey: string, clientId: string) => {
  return new Promise<void>((resolve, reject) => {
    const gapi = (window as any).gapi;
    if (!gapi) {
      reject("Google API Script not loaded");
      return;
    }

    gapi.load('client:auth2', async () => {
      try {
        await gapi.client.init({
          apiKey: apiKey,
          clientId: clientId,
          discoveryDocs: [
            "https://sheets.googleapis.com/$discovery/rest?version=v4",
            "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"
          ],
          scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
          plugin_name: "InventoryApp",
          // @ts-ignore - Required for local development environments
          cookie_policy: 'single_host_origin'
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
};

export const signIn = async () => {
  const gapi = (window as any).gapi;
  return gapi.auth2.getAuthInstance().signIn();
};

export const isSignedIn = () => {
  const gapi = (window as any).gapi;
  return gapi.auth2?.getAuthInstance()?.isSignedIn.get();
};

// Helper to upload base64 image to Drive
const uploadImage = async (base64String: string, fileName: string): Promise<string | null> => {
  try {
    const gapi = (window as any).gapi;
    
    // Convert Base64 to Blob
    const byteString = atob(base64String.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: 'image/jpeg' });

    const metadata = {
      name: fileName,
      parents: [DRIVE_FOLDER_ID]
    };

    const accessToken = gapi.auth.getToken().access_token;
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
  } catch (error) {
    console.error("Drive Upload Error", error);
    return null;
  }
};

export const syncDataToSheets = async (
  state: AppState, 
  onSuccess: (result: { 
    outwards: string[], 
    inwards: string[], 
    vendors: string[], 
    items: string[], 
    works: string[],
    updatedOutwardEntriesWithUrls?: {id: string, url: string}[]
  }) => void
) => {
  const gapi = (window as any).gapi;
  
  const unsyncedOutward = state.outwardEntries.filter(e => !e.synced);
  const unsyncedInward = state.inwardEntries.filter(e => !e.synced);
  const unsyncedVendors = state.vendors.filter(e => !e.synced);
  const unsyncedItems = state.items.filter(e => !e.synced);
  const unsyncedWorks = state.workTypes.filter(e => !e.synced);

  if (!unsyncedOutward.length && !unsyncedInward.length && !unsyncedVendors.length && !unsyncedItems.length && !unsyncedWorks.length) {
    return { success: true, message: "Nothing to sync" };
  }

  try {
    const updatedOutwardEntriesWithUrls: {id: string, url: string}[] = [];

    // 1. Sync Vendors
    if (unsyncedVendors.length > 0) {
      const rows = unsyncedVendors.map(v => [v.name, v.code]);
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEETS_CONFIG.vendorSheetName}!A:B`,
        valueInputOption: "USER_ENTERED",
        resource: { values: rows }
      });
    }

    // 2. Sync Items
    if (unsyncedItems.length > 0) {
      const rows = unsyncedItems.map(i => [i.sku, i.description]);
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEETS_CONFIG.itemSheetName}!A:B`,
        valueInputOption: "USER_ENTERED",
        resource: { values: rows }
      });
    }

    // 3. Sync Work Types
    if (unsyncedWorks.length > 0) {
      const rows = unsyncedWorks.map(w => [w.name]);
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEETS_CONFIG.workSheetName}!A:A`,
        valueInputOption: "USER_ENTERED",
        resource: { values: rows }
      });
    }

    // 4. Sync Outward (With Image Upload)
    if (unsyncedOutward.length > 0) {
      const rows = [];
      for (const e of unsyncedOutward) {
        let photoUrl = e.photoUrl || '';
        
        // Upload photo if exists and no URL yet
        if (e.photo && !photoUrl) {
          const fileName = `OUT_${e.challanNo}_${e.date.split('T')[0]}.jpg`;
          const url = await uploadImage(e.photo, fileName);
          if (url) {
            photoUrl = url;
            updatedOutwardEntriesWithUrls.push({ id: e.id, url: photoUrl });
          }
        }

        const vendor = state.vendors.find(v => v.id === e.vendorId)?.name || 'Unknown';
        const item = state.items.find(i => i.id === e.skuId)?.sku || 'Unknown';
        const work = state.workTypes.find(w => w.id === e.workId)?.name || '';
        
        rows.push([
          e.date.split('T')[0],
          vendor,
          e.challanNo,
          item,
          e.qty,
          e.totalWeight,
          e.pendalWeight,
          e.materialWeight,
          work,
          e.remarks || '',
          photoUrl || (e.photo ? 'Image Pending' : '')
        ]);
      }

      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEETS_CONFIG.outwardSheetName}!A:K`,
        valueInputOption: "USER_ENTERED",
        resource: { values: rows }
      });
    }

    // 5. Sync Inward
    if (unsyncedInward.length > 0) {
      const rows = unsyncedInward.map(e => {
        const outward = state.outwardEntries.find(o => o.id === e.outwardChallanId);
        const item = state.items.find(i => i.id === e.skuId)?.sku || 'Unknown';
        
        return [
          e.date.split('T')[0],
          outward ? outward.challanNo : '---',
          item,
          e.qty,
          e.totalWeight,
          e.pendalWeight,
          e.materialWeight,
          e.remarks || ''
        ];
      });

      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEETS_CONFIG.inwardSheetName}!A:H`,
        valueInputOption: "USER_ENTERED",
        resource: { values: rows }
      });
    }

    onSuccess({
      outwards: unsyncedOutward.map(e => e.id),
      inwards: unsyncedInward.map(e => e.id),
      vendors: unsyncedVendors.map(e => e.id),
      items: unsyncedItems.map(e => e.id),
      works: unsyncedWorks.map(e => e.id),
      updatedOutwardEntriesWithUrls
    });

    return { success: true, message: `Synced successfully.` };

  } catch (error: any) {
    console.error("Sync Error", error);
    return { success: false, message: error.result?.error?.message || "Sync failed" };
  }
};