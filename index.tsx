import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { Camera, Plus, AlertCircle, Clock, Trash2, Save, RefreshCw, ChevronDown, ChevronUp, Settings, Upload, Download, Settings2, BarChart3, Copy, X, Printer, FileDown } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// --- TYPES ---
export interface Vendor { id: string; name: string; code: string; synced?: boolean; }
export interface Item { id: string; sku: string; description: string; synced?: boolean; }
export interface WorkType { id: string; name: string; synced?: boolean; }

export interface OutwardEntry {
  id: string; date: string; vendorId: string; challanNo: string; skuId: string;
  qty: number; comboQty?: number; totalWeight: number; pendalWeight: number; materialWeight: number;
  workId: string; photo?: string; photoUrl?: string; remarks?: string; 
  enteredBy?: string; checkedBy?: string; synced?: boolean;
}

export interface InwardEntry {
  id: string; date: string; outwardChallanId: string; vendorId: string; skuId: string;
  qty: number; comboQty?: number; totalWeight: number; pendalWeight: number; materialWeight: number;
  remarks?: string; enteredBy?: string; checkedBy?: string; 
  photo?: string; photoUrl?: string; // Added photo support
  synced?: boolean;
}

export interface AppState {
  vendors: Vendor[]; items: Item[]; workTypes: WorkType[];
  outwardEntries: OutwardEntry[]; inwardEntries: InwardEntry[];
}

export const SHEETS_CONFIG = {
  spreadsheetId: "14-vN1JG8IVP1QAGUkXBjmFzg8ZfDSfbT63LMc9O7oOA",
  outwardSheetName: "Outward",
  inwardSheetName: "Inward",
  vendorSheetName: "VENDOR MASTER",
  itemSheetName: "ITEM MASTER",
  workSheetName: "WORK MASTER"
};
export const DRIVE_CONFIG = { folderId: "1YRTRbcjbj6RReN28fIXK0oanTwW_z8A0" };

// --- DATA SERVICES ---
const STORAGE_KEY = 'jobwork_app_data_final_v2';
const initialData: AppState = { vendors: [], items: [], workTypes: [], outwardEntries: [], inwardEntries: [] };

const loadData = (): AppState => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? { ...initialData, ...JSON.parse(saved) } : initialData;
};
const saveData = (data: AppState) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

// --- GOOGLE SERVICES (GIS + GAPI) ---
const initGapiClient = async (apiKey: string) => {
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

const initTokenClient = (clientId: string, callback: (resp: any) => void) => {
  const google = (window as any).google;
  if (!google?.accounts?.oauth2) throw new Error("Google Identity Script missing");
  return google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
    callback: callback,
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
  } catch (error) { console.error("Drive Upload Error", error); return null; }
};

// --- BIDIRECTIONAL SYNC ---
const syncBidirectional = async (currentState: AppState, onUpdateState: (newState: AppState) => void) => {
  const gapi = (window as any).gapi;
  
  // 1. PUSH: Upload Unsynced Local Data
  const unsyncedOut = currentState.outwardEntries.filter(e => !e.synced);
  const unsyncedIn = currentState.inwardEntries.filter(e => !e.synced);
  const unsyncedVendors = currentState.vendors.filter(e => !e.synced);
  const unsyncedItems = currentState.items.filter(e => !e.synced);
  const unsyncedWorks = currentState.workTypes.filter(e => !e.synced);

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
      const vendor = currentState.vendors.find(v => v.id === e.vendorId)?.name || 'Unknown';
      const item = currentState.items.find(i => i.id === e.skuId)?.sku || 'Unknown';
      
      // COLUMNS: Date | Vendor | Challan | Item | Qty | Combo | TW | PW | Mat | Checked | Entered | Image | Work | Remarks
      // INDICES: 0    | 1      | 2       | 3    | 4   | 5     | 6  | 7  | 8   | 9       | 10      | 11    | 12   | 13
      rows.push([
        e.date.split('T')[0], 
        vendor, 
        e.challanNo, 
        item, 
        e.qty, 
        e.comboQty || '', 
        e.totalWeight, 
        e.pendalWeight, 
        e.materialWeight, 
        e.checkedBy || '', 
        e.enteredBy || '', 
        photoUrl,
        currentState.workTypes.find(w => w.id === e.workId)?.name || '', 
        e.remarks || ''
      ]);
    }
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_CONFIG.spreadsheetId, range: `${SHEETS_CONFIG.outwardSheetName}!A:N`,
      valueInputOption: "USER_ENTERED", resource: { values: rows }
    });
  }

  // Sync Inward
  if (unsyncedIn.length) {
    const rows = [];
    for (const e of unsyncedIn) {
      let photoUrl = e.photoUrl || '';
      if (e.photo && !photoUrl) {
        const outChallan = currentState.outwardEntries.find(o => o.id === e.outwardChallanId)?.challanNo || 'UNK';
        const url = await uploadImage(e.photo, `IN_${outChallan}_${e.date.split('T')[0]}.jpg`);
        if (url) photoUrl = url;
      }
      const out = currentState.outwardEntries.find(o => o.id === e.outwardChallanId);
      const item = currentState.items.find(i => i.id === e.skuId)?.sku || 'Unknown';
      const vendor = currentState.vendors.find(v => v.id === e.vendorId)?.name || 'Unknown';
      
      // COLUMNS: Date | Vendor | Challan | Item | Qty | Combo | TW | PW | Mat | Checked | Entered | Image | Remarks
      // INDICES: 0    | 1      | 2       | 3    | 4   | 5     | 6  | 7  | 8   | 9       | 10      | 11    | 12
      rows.push([
        e.date.split('T')[0], 
        vendor,
        out ? out.challanNo : '---', 
        item, 
        e.qty, 
        e.comboQty || '', 
        e.totalWeight, 
        e.pendalWeight, 
        e.materialWeight, 
        e.checkedBy || '', 
        e.enteredBy || '', 
        photoUrl,
        e.remarks || ''
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
    `${SHEETS_CONFIG.outwardSheetName}!A:N`,
    `${SHEETS_CONFIG.inwardSheetName}!A:M`
  ];
  const resp = await gapi.client.sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEETS_CONFIG.spreadsheetId, ranges });
  const valueRanges = resp.result.valueRanges;

  // Reconstruct State
  const newVendors: Vendor[] = (valueRanges[0].values || []).map((r:any) => ({ id: uuidv4(), name: r[0], code: r[1], synced: true }));
  const newItems: Item[] = (valueRanges[1].values || []).map((r:any) => ({ id: uuidv4(), sku: r[0], description: r[1] || '', synced: true }));
  const newWorks: WorkType[] = (valueRanges[2].values || []).map((r:any) => ({ id: uuidv4(), name: r[0], synced: true }));

  // Helper to find ID by Name (Trimmed and Lowercase for fuzzy matching)
  const getVendorId = (name: string) => newVendors.find(v => v.name.trim().toLowerCase() === name?.trim().toLowerCase())?.id || '';
  const getItemId = (sku: string) => newItems.find(i => i.sku.trim().toLowerCase() === sku?.trim().toLowerCase())?.id || '';
  const getWorkId = (name: string) => newWorks.find(w => w.name.trim().toLowerCase() === name?.trim().toLowerCase())?.id || '';

  const newOutward: OutwardEntry[] = (valueRanges[3].values || []).map((r:any) => ({
    id: uuidv4(),
    date: r[0] ? new Date(r[0]).toISOString() : new Date().toISOString(),
    vendorId: getVendorId(r[1]),
    challanNo: r[2],
    skuId: getItemId(r[3]),
    qty: parseFloat(r[4] || 0),
    comboQty: parseFloat(r[5] || 0),
    totalWeight: parseFloat(r[6] || 0),
    pendalWeight: parseFloat(r[7] || 0),
    materialWeight: parseFloat(r[8] || 0),
    checkedBy: r[9] || '',
    enteredBy: r[10] || '',
    photoUrl: r[11] || '',
    workId: getWorkId(r[12]),
    remarks: r[13] || '',
    synced: true
  }));

  const newInward: InwardEntry[] = (valueRanges[4].values || []).map((r:any) => {
    // Try to link to outward challan by Number
    const outChallan = newOutward.find(o => o.challanNo === r[2]);
    return {
      id: uuidv4(),
      date: r[0] ? new Date(r[0]).toISOString() : new Date().toISOString(),
      vendorId: getVendorId(r[1]),
      outwardChallanId: outChallan?.id || '',
      skuId: getItemId(r[3]),
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
};

// --- UI COMPONENTS ---
const Button = ({ className = '', variant = 'primary', ...props }: any) => {
  const v = {
    primary: "bg-blue-600 text-white shadow-blue-200 shadow-lg",
    secondary: "bg-slate-100 text-slate-700",
    danger: "bg-red-50 text-red-600"
  };
  return <button className={`px-6 py-3.5 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center w-full ${v[variant as keyof typeof v]} ${className}`} {...props} />;
};

const Input = ({ label, className = '', ...props }: any) => (
  <div className="mb-4">
    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">{label}</label>
    <input className={`w-full p-4 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all shadow-sm ${className}`} {...props} />
  </div>
);

const Select = ({ label, children, ...props }: any) => (
  <div className="mb-4">
    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">{label}</label>
    <div className="relative">
      <select className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none appearance-none shadow-sm" {...props}>{children}</select>
      <ChevronDown size={20} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
    </div>
  </div>
);

const Card = ({ children, title, className = '' }: any) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-4 ${className}`}>
    {title && <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 pb-2 border-b border-slate-50">{title}</h3>}
    {children}
  </div>
);

const PrintChallan = ({ entry, state, onClose }: { entry: OutwardEntry, state: AppState, onClose: () => void }) => {
  const vendor = state.vendors.find(v => v.id === entry.vendorId);
  const item = state.items.find(i => i.id === entry.skuId);
  const work = state.workTypes.find(w => w.id === entry.workId);

  return (
    <div id="print-area" className="flex flex-col h-full bg-white text-black p-8 font-serif">
      <div className="text-center border-b-2 border-black pb-4 mb-4">
        <h1 className="text-4xl font-bold mb-1">RKJ RAKHI</h1>
        <p className="text-sm font-bold tracking-widest uppercase">Ahmedabad, Gujarat</p>
        <h2 className="text-xl font-bold mt-4 uppercase border px-4 py-1 inline-block border-black">Job Work Challan</h2>
      </div>

      <div className="flex justify-between mb-6 text-sm">
        <div>
          <p><strong>Vendor:</strong> {vendor?.name} ({vendor?.code})</p>
        </div>
        <div className="text-right">
          <p><strong>Challan No:</strong> {entry.challanNo}</p>
          <p><strong>Date:</strong> {new Date(entry.date).toLocaleDateString()}</p>
          <p><strong>Work:</strong> {work?.name}</p>
        </div>
      </div>

      <table className="w-full border-collapse border border-black mb-8 text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-2">SKU</th>
            <th className="border border-black p-2">Qty</th>
            <th className="border border-black p-2">Combo</th>
            <th className="border border-black p-2">Total Wt</th>
            <th className="border border-black p-2">Net Mat. Wt</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black p-4 text-center">{item?.sku}</td>
            <td className="border border-black p-4 text-center font-bold">{entry.qty}</td>
            <td className="border border-black p-4 text-center">{entry.comboQty || '-'}</td>
            <td className="border border-black p-4 text-center">{entry.totalWeight}</td>
            <td className="border border-black p-4 text-center font-bold">{entry.materialWeight}</td>
          </tr>
        </tbody>
      </table>

      <div className="mb-8">
        <p className="font-bold text-xs uppercase mb-1">Remarks</p>
        <p className="border-b border-dotted border-black p-2 min-h-[40px]">{entry.remarks || ''}</p>
      </div>

      <div className="grid grid-cols-3 gap-8 mt-auto pt-16 text-xs font-bold uppercase text-center">
        <div className="border-t border-black pt-2">
           <div className="mb-1">Entered By</div>
           <div className="font-normal normal-case">{entry.enteredBy || 'Admin'}</div>
        </div>
        <div className="border-t border-black pt-2">
           <div className="mb-1">Checked By</div>
           <div className="font-normal normal-case">{entry.checkedBy || '-'}</div>
        </div>
        <div className="border-t border-black pt-2">Vendor Signature</div>
      </div>

      <button onClick={onClose} className="no-print fixed top-4 right-4 bg-red-600 text-white p-2 rounded-full shadow-lg hover:bg-red-700 z-50">
        <X size={24} />
      </button>
    </div>
  );
};

const TabBar = ({ currentTab, setTab }: any) => (
  <div className="fixed bottom-0 left-0 right-0 glass-nav px-2 pb-safe-bottom flex justify-around z-50 h-20 items-center safe-area-pb no-print">
    {[
      { id: 'outward', label: 'Outward', icon: <Upload size={24} /> },
      { id: 'inward', label: 'Inward', icon: <Download size={24} /> },
      { id: 'recon', label: 'Report', icon: <BarChart3 size={24} /> },
      { id: 'masters', label: 'Setup', icon: <Settings2 size={24} /> },
    ].map(t => (
      <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-col items-center justify-center p-2 rounded-2xl transition-all duration-300 w-full ${currentTab === t.id ? 'text-blue-600 scale-105' : 'text-slate-400'}`}>
        <span className="mb-1">{t.icon}</span><span className="text-[10px] font-bold uppercase">{t.label}</span>
      </button>
    ))}
  </div>
);

// --- PAGES ---
const Masters = ({ vendors, setVendors, items, setItems, workTypes, setWorkTypes }: any) => {
  const [section, setSection] = useState('vendors');
  const [vendor, setVendor] = useState({ name: '', code: '' });
  const [item, setItem] = useState({ sku: '' });
  const [work, setWork] = useState({ name: '' });

  return (
    <div className="pb-32 px-4 pt-4">
      <div className="flex p-1 bg-slate-200 rounded-xl mb-6">
        {['vendors', 'items', 'work'].map(s => (
          <button key={s} onClick={() => setSection(s)} className={`flex-1 py-2 text-xs font-bold rounded-lg uppercase ${section === s ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>{s}</button>
        ))}
      </div>
      {section === 'vendors' && (
        <>
          <Card title="Add Vendor">
            <div className="flex gap-2"><Input label="Name" value={vendor.name} onChange={(e:any) => setVendor({...vendor, name: e.target.value})} /><Input label="Code" className="w-24" value={vendor.code} onChange={(e:any) => setVendor({...vendor, code: e.target.value.toUpperCase()})} /></div>
            <Button onClick={() => { if(vendor.name && vendor.code) { setVendors([...vendors, { id: uuidv4(), ...vendor, synced: false }]); setVendor({ name: '', code: '' }); } }}>Add Vendor</Button>
          </Card>
          {vendors.map((v:any) => <div key={v.id} className="bg-white p-4 rounded-xl border border-slate-200 mb-2 flex justify-between"><div><div className="font-bold">{v.name}</div><div className="text-xs text-slate-500">{v.code}</div></div><button onClick={() => setVendors(vendors.filter((x:any) => x.id !== v.id))} className="text-slate-400"><Trash2 size={18} /></button></div>)}
        </>
      )}
      {section === 'items' && (
        <>
          <Card title="Add Item">
            <Input label="SKU" value={item.sku} onChange={(e:any) => setItem({sku: e.target.value.toUpperCase()})} />
            <Button onClick={() => { if(item.sku) { setItems([...items, { id: uuidv4(), ...item, synced: false }]); setItem({ sku: '' }); } }}>Add Item</Button>
          </Card>
          {items.map((i:any) => <div key={i.id} className="bg-white p-4 rounded-xl border border-slate-200 mb-2 flex justify-between"><div className="font-bold">{i.sku}</div><button onClick={() => setItems(items.filter((x:any) => x.id !== i.id))} className="text-slate-400"><Trash2 size={18} /></button></div>)}
        </>
      )}
      {section === 'work' && (
        <>
          <Card title="Add Work Type">
            <Input label="Name" value={work.name} onChange={(e:any) => setWork({name: e.target.value})} />
            <Button onClick={() => { if(work.name) { setWorkTypes([...workTypes, { id: uuidv4(), ...work, synced: false }]); setWork({ name: '' }); } }}>Add Work</Button>
          </Card>
          {workTypes.map((w:any) => <div key={w.id} className="bg-white p-4 rounded-xl border border-slate-200 mb-2 flex justify-between"><div className="font-bold">{w.name}</div><button onClick={() => setWorkTypes(workTypes.filter((x:any) => x.id !== w.id))} className="text-slate-400"><Trash2 size={18} /></button></div>)}
        </>
      )}
    </div>
  );
};

const Outward = ({ state, onSave, onAddItem }: any) => {
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], vendorId: '', qty: '', comboQty: '', totalWeight: '', pendalWeight: '', materialWeight: '', workId: '', remarks: '', photo: '', enteredBy: '', checkedBy: '' });
  const [sku, setSku] = useState('');
  const [lastSaved, setLastSaved] = useState<OutwardEntry | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  
  useEffect(() => {
    const mat = (parseFloat(form.totalWeight) || 0) - (parseFloat(form.pendalWeight) || 0);
    setForm(f => ({ ...f, materialWeight: mat > 0 ? mat.toFixed(3) : '' }));
  }, [form.totalWeight, form.pendalWeight]);

  const handleSubmit = () => {
    if (!form.vendorId || !sku || !form.qty) return alert("Required fields missing");
    let skuId = state.items.find((i:any) => i.sku === sku)?.id;
    if (!skuId) {
      const newItem = { id: uuidv4(), sku, description: 'Auto', synced: false };
      onAddItem(newItem);
      skuId = newItem.id;
    }
    const vendor = state.vendors.find((v:any) => v.id === form.vendorId);
    const count = state.outwardEntries.filter((e:any) => e.vendorId === form.vendorId).length + 1;
    const challanNo = `${vendor?.code}-${count.toString().padStart(3, '0')}`;

    const newEntry = { id: uuidv4(), ...form, skuId, challanNo, qty: parseFloat(form.qty), comboQty: parseFloat(form.comboQty) || 0, totalWeight: parseFloat(form.totalWeight), pendalWeight: parseFloat(form.pendalWeight), materialWeight: parseFloat(form.materialWeight), synced: false };
    onSave(newEntry);
    setLastSaved(newEntry);
    setForm({ ...form, qty: '', comboQty: '', totalWeight: '', pendalWeight: '', materialWeight: '', remarks: '', photo: '' }); 
    setSku('');
  };

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => { window.print(); }, 100);
  };

  if (isPrinting && lastSaved) return <PrintChallan entry={lastSaved} state={state} onClose={() => setIsPrinting(false)} />;

  if(!state.vendors.length) return <div className="p-10 text-center text-slate-500">Please add Vendors in Setup first.</div>;

  return (
    <div className="pb-32 px-4 pt-4">
      {lastSaved && (
        <div className="mb-4 bg-green-50 p-4 rounded-xl border border-green-200 flex justify-between items-center">
          <span className="text-green-700 font-bold">Challan {lastSaved.challanNo} Saved!</span>
          <button onClick={handlePrint} className="flex items-center bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold"><Printer size={16} className="mr-2"/> Print</button>
        </div>
      )}
      <Card>
        <div className="grid grid-cols-2 gap-4"><Input label="Date" type="date" value={form.date} onChange={(e:any) => setForm({...form, date: e.target.value})} /><div className="pt-8 text-right font-mono font-bold text-slate-400">CHALLAN #{state.vendors.find((v:any) => v.id === form.vendorId)?.code || '---'}</div></div>
        <Select label="Vendor" value={form.vendorId} onChange={(e:any) => setForm({...form, vendorId: e.target.value})}>
          <option value="">Select Vendor</option>
          {state.vendors.map((v:any) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        <div className="mb-4">
          <label className="block text-xs font-bold uppercase text-slate-500 mb-1 ml-1">SKU</label>
          <input list="skus" className="w-full p-4 border border-slate-200 rounded-xl" value={sku} onChange={e => setSku(e.target.value.toUpperCase())} placeholder="Item Code" />
          <datalist id="skus">{state.items.map((i:any) => <option key={i.id} value={i.sku} />)}</datalist>
        </div>
        <div className="grid grid-cols-2 gap-4"><Input label="Qty" type="number" value={form.qty} onChange={(e:any) => setForm({...form, qty: e.target.value})} /><Input label="Combo Qty (Opt)" type="number" value={form.comboQty} onChange={(e:any) => setForm({...form, comboQty: e.target.value})} /></div>
        <div className="grid grid-cols-3 gap-2"><Input label="Total Wt" type="number" value={form.totalWeight} onChange={(e:any) => setForm({...form, totalWeight: e.target.value})} /><Input label="Pendal Wt" type="number" value={form.pendalWeight} onChange={(e:any) => setForm({...form, pendalWeight: e.target.value})} /><Input label="Mat. Wt" className="bg-slate-100" readOnly value={form.materialWeight} /></div>
        <Select label="Work" value={form.workId} onChange={(e:any) => setForm({...form, workId: e.target.value})}><option value="">Select Work</option>{state.workTypes.map((w:any) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
        <div className="grid grid-cols-2 gap-4"><Input label="Entered By" value={form.enteredBy} onChange={(e:any) => setForm({...form, enteredBy: e.target.value})} /><Input label="Checked By" value={form.checkedBy} onChange={(e:any) => setForm({...form, checkedBy: e.target.value})} /></div>
        <div className="mb-4"><label className="block text-xs font-bold uppercase text-slate-500 mb-1 ml-1">Photo</label><label className="flex items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer hover:bg-slate-50"><Camera className="mr-2 text-slate-400"/> {form.photo ? 'Retake' : 'Capture'}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if(e.target.files?.[0]) { const r = new FileReader(); r.onload = ev => setForm({...form, photo: ev.target?.result as string}); r.readAsDataURL(e.target.files[0]); } }} /></label>{form.photo && <img src={form.photo} className="mt-2 h-24 rounded-lg border" />}</div>
        <Input label="Remarks" value={form.remarks} onChange={(e:any) => setForm({...form, remarks: e.target.value})} />
        <Button onClick={handleSubmit}><Save className="mr-2" size={18} /> Save Entry</Button>
      </Card>
    </div>
  );
};

const Inward = ({ state, onSave }: any) => {
  const [vendorId, setVendorId] = useState('');
  const [outwardId, setOutwardId] = useState('');
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], qty: '', comboQty: '', totalWeight: '', pendalWeight: '', materialWeight: '', remarks: '', enteredBy: '', checkedBy: '', photo: '' });
  
  const selectedOutward = state.outwardEntries.find((e:any) => e.id === outwardId);
  const pending = state.outwardEntries.filter((e:any) => {
    if(e.vendorId !== vendorId) return false;
    const recv = state.inwardEntries.filter((i:any) => i.outwardChallanId === e.id).reduce((s:number, i:any) => s + i.qty, 0);
    return recv < e.qty;
  });

  useEffect(() => {
    if(selectedOutward) setForm({ ...form, qty: selectedOutward.qty, comboQty: selectedOutward.comboQty, totalWeight: selectedOutward.totalWeight, pendalWeight: selectedOutward.pendalWeight, materialWeight: selectedOutward.materialWeight });
  }, [selectedOutward]);

  useEffect(() => {
    const mat = (parseFloat(form.totalWeight) || 0) - (parseFloat(form.pendalWeight) || 0);
    setForm(f => ({ ...f, materialWeight: mat > 0 ? mat.toFixed(3) : '' }));
  }, [form.totalWeight, form.pendalWeight]);

  const handleSubmit = () => {
    if (!outwardId || !form.qty) return alert("Select Challan & Qty");
    onSave({ id: uuidv4(), outwardChallanId: outwardId, vendorId, skuId: selectedOutward.skuId, ...form, qty: parseFloat(form.qty), comboQty: parseFloat(form.comboQty) || 0, totalWeight: parseFloat(form.totalWeight), pendalWeight: parseFloat(form.pendalWeight), materialWeight: parseFloat(form.materialWeight), synced: false });
    setForm({ ...form, qty: '', comboQty: '', totalWeight: '', pendalWeight: '', materialWeight: '', photo: '' }); setOutwardId('');
  };

  return (
    <div className="pb-32 px-4 pt-4">
      <Card title="Source">
        <Select label="Vendor" value={vendorId} onChange={(e:any) => { setVendorId(e.target.value); setOutwardId(''); }}><option value="">Select Vendor</option>{state.vendors.map((v:any) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
        {vendorId && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase">Pending Challans</div>
            {!pending.length && <div className="text-sm text-slate-400 italic">No pending items.</div>}
            {pending.map((p:any) => {
              const item = state.items.find((i:any) => i.id === p.skuId);
              return <div key={p.id} onClick={() => setOutwardId(p.id)} className={`p-3 border rounded-xl cursor-pointer ${outwardId === p.id ? 'border-blue-500 bg-blue-50' : 'bg-white'}`}><div className="flex justify-between font-bold text-sm"><span>#{p.challanNo}</span><span>{p.date.split('T')[0]}</span></div><div className="text-xs text-slate-500">{item?.sku} - Qty: {p.qty}</div></div>;
            })}
          </div>
        )}
      </Card>
      {selectedOutward && (
        <Card title={`Receiving for #${selectedOutward.challanNo}`} className="border-t-4 border-t-green-500">
           <Input label="Recv Date" type="date" value={form.date} onChange={(e:any) => setForm({...form, date: e.target.value})} />
           <div className="grid grid-cols-2 gap-4"><Input label="Recv Qty" type="number" value={form.qty} onChange={(e:any) => setForm({...form, qty: e.target.value})} /><Input label="Combo Qty" type="number" value={form.comboQty} onChange={(e:any) => setForm({...form, comboQty: e.target.value})} /></div>
           <div className="grid grid-cols-3 gap-2"><Input label="Total Wt" type="number" value={form.totalWeight} onChange={(e:any) => setForm({...form, totalWeight: e.target.value})} /><Input label="Pendal Wt" type="number" value={form.pendalWeight} onChange={(e:any) => setForm({...form, pendalWeight: e.target.value})} /><Input label="Mat. Wt" className="bg-slate-100" readOnly value={form.materialWeight} /></div>
           <div className="grid grid-cols-2 gap-4"><Input label="Entered By" value={form.enteredBy} onChange={(e:any) => setForm({...form, enteredBy: e.target.value})} /><Input label="Checked By" value={form.checkedBy} onChange={(e:any) => setForm({...form, checkedBy: e.target.value})} /></div>
           <div className="mb-4"><label className="block text-xs font-bold uppercase text-slate-500 mb-1 ml-1">Inward Photo</label><label className="flex items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer hover:bg-slate-50"><Camera className="mr-2 text-slate-400"/> {form.photo ? 'Retake' : 'Capture'}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if(e.target.files?.[0]) { const r = new FileReader(); r.onload = ev => setForm({...form, photo: ev.target?.result as string}); r.readAsDataURL(e.target.files[0]); } }} /></label>{form.photo && <img src={form.photo} className="mt-2 h-24 rounded-lg border" />}</div>
           <Input label="Remarks" value={form.remarks} onChange={(e:any) => setForm({...form, remarks: e.target.value})} />
           <Button onClick={handleSubmit}><Download className="mr-2" size={18} /> Save Inward</Button>
        </Card>
      )}
    </div>
  );
};

const Report = ({ state, syncAndRefresh }: any) => {
  const [status, setStatus] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('GOOGLE_API_KEY') || '');
  const [clientId, setClientId] = useState(localStorage.getItem('GOOGLE_CLIENT_ID') || '');
  const [showConfig, setShowConfig] = useState(false);
  const [printEntry, setPrintEntry] = useState<OutwardEntry | null>(null);
  const tokenClient = useRef<any>(null);

  const unsynced = state.outwardEntries.filter((e:any)=>!e.synced).length + state.inwardEntries.filter((e:any)=>!e.synced).length + state.vendors.filter((e:any)=>!e.synced).length;
  const currentOrigin = window.location.origin;

  const handleSync = async () => {
    if (!apiKey || !clientId) { setShowConfig(true); return; }
    setIsSyncing(true); setStatus("Connecting...");
    try {
      await initGapiClient(apiKey);
      if (!tokenClient.current) {
        tokenClient.current = initTokenClient(clientId, async (resp: any) => {
          if (resp.error) throw resp;
          setStatus("Syncing...");
          const res = await syncBidirectional(state, syncAndRefresh);
          setStatus(res.message);
          setIsSyncing(false);
        });
      }
      tokenClient.current.requestAccessToken({ prompt: '' });
      localStorage.setItem('GOOGLE_API_KEY', apiKey); localStorage.setItem('GOOGLE_CLIENT_ID', clientId);
    } catch (e: any) {
      console.error(e);
      let msg = e.message || JSON.stringify(e);
      if (msg.includes("origin")) msg = `ORIGIN ERROR: Add ${currentOrigin} to Google Cloud Console`;
      setStatus(msg); setShowConfig(true); setIsSyncing(false);
    }
  };

  const handleDownloadCSV = () => {
    const headers = "Vendor,ChallanNo,OutwardDate,PendingDays,SKU,OutQty,InQty,PendingQty,TotalWt,MatWt,Status\n";
    const rows = stats.flatMap((s:any) => s.rows.map((r:any) => {
        const item = state.items.find((i:any) => i.id === r.skuId);
        const days = Math.floor((new Date().getTime() - new Date(r.date).getTime()) / (1000 * 60 * 60 * 24));
        return `${s.vendor.name},${r.challanNo},${r.date.split('T')[0]},${days},${item?.sku || ''},${r.qty},${r.inQty},${r.pending},${r.totalWeight},${r.materialWeight},${r.pending > 0 ? 'Pending' : 'Completed'}`;
    })).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `JobWork_Recon_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  };

  const stats = useMemo(() => {
    return state.vendors.map((v:any) => {
      const outs = state.outwardEntries.filter((e:any) => e.vendorId === v.id);
      const rows = outs.map((o:any) => {
        const inQty = state.inwardEntries.filter((i:any) => i.outwardChallanId === o.id).reduce((s:number, i:any) => s + i.qty, 0);
        return { ...o, inQty, pending: o.qty - inQty };
      });
      const pendingTotal = rows.reduce((s:number, r:any) => s + r.pending, 0);
      return { vendor: v, pendingTotal, rows: rows.sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime()) };
    }).filter((x:any) => x.rows.length > 0);
  }, [state]);

  if (printEntry) return <PrintChallan entry={printEntry} state={state} onClose={() => setPrintEntry(null)} />;

  return (
    <div className="pb-32 px-4 pt-4">
      <Card className="bg-blue-50 border-blue-200">
        <div className="flex justify-between items-center mb-2">
           <div><div className="text-2xl font-black text-blue-600">{unsynced}</div><div className="text-xs text-blue-500 font-bold uppercase">Unsynced Local Items</div></div>
           <Button onClick={handleSync} disabled={isSyncing} className="w-auto text-sm bg-blue-600 hover:bg-blue-700">{isSyncing ? 'Syncing...' : 'Sync & Download'}</Button>
           <button onClick={() => setShowConfig(!showConfig)} className="p-2 text-blue-400"><Settings size={20}/></button>
        </div>
        <Button onClick={handleDownloadCSV} variant="secondary" className="text-xs py-2"><FileDown size={14} className="mr-2"/> Download CSV</Button>
        {status && <div className={`mt-2 text-xs font-mono p-2 rounded ${status.includes('ERROR') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{status}</div>}
        {showConfig && (
          <div className="mt-4 pt-4 border-t border-blue-200">
            <div className="bg-yellow-50 p-2 text-xs border border-yellow-200 rounded mb-2 text-yellow-800">Ensure this URI is in Google Console:<br/><code className="font-bold select-all">{currentOrigin}</code></div>
            <Input label="Client ID" value={clientId} onChange={(e:any) => setClientId(e.target.value)} />
            <Input label="API Key" value={apiKey} onChange={(e:any) => setApiKey(e.target.value)} />
          </div>
        )}
      </Card>
      {stats.map((s:any) => (
        <div key={s.vendor.id} className="bg-white rounded-xl shadow-sm border border-slate-200 mb-4 overflow-hidden">
          <div className="p-4 bg-slate-50 flex justify-between">
             <div className="font-bold text-lg">{s.vendor.name}</div>
             <div className={`${s.pendingTotal > 0 ? 'text-orange-600' : 'text-green-600'} font-bold`}>{s.pendingTotal} Pending</div>
          </div>
          <div className="divide-y divide-slate-100">
            {s.rows.map((r:any) => {
               const item = state.items.find((i:any) => i.id === r.skuId);
               const days = Math.floor((new Date().getTime() - new Date(r.date).getTime()) / (1000 * 60 * 60 * 24));
               return (
                 <div key={r.id} className="p-3 text-sm">
                   <div className="flex justify-between items-center mb-1">
                      <span className="font-mono font-bold text-slate-600">{r.challanNo}</span>
                      <span className="text-xs text-slate-400">{r.date.split('T')[0]}</span>
                      <button onClick={() => { setPrintEntry(r); setTimeout(()=>window.print(),100); }} className="text-blue-500 hover:bg-blue-50 p-1 rounded"><Printer size={14}/></button>
                   </div>
                   <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-slate-800">{item?.sku}</span>
                      <span className="font-mono">{r.inQty} / {r.qty}</span>
                   </div>
                   {r.pending > 0 ? (
                      <div className="text-xs text-orange-500 font-bold text-right">{r.pending} PENDING ({days} Days)</div>
                   ) : (
                      <div className="text-xs text-green-600 font-bold text-right">COMPLETED</div>
                   )}
                 </div>
               );
            })}
          </div>
        </div>
      ))}
      {!stats.length && <div className="text-center text-slate-400 mt-10">No transactions found.</div>}
    </div>
  );
};

// --- MAIN APP ---
const App = () => {
  const [tab, setTab] = useState('outward');
  const [state, setState] = useState<AppState>(loadData());
  useEffect(() => saveData(state), [state]);

  const update = (k: keyof AppState, v: any) => setState(prev => ({ ...prev, [k]: v }));
  const addOut = (e: OutwardEntry) => setState(prev => ({ ...prev, outwardEntries: [...prev.outwardEntries, e] }));
  const addIn = (e: InwardEntry) => setState(prev => ({ ...prev, inwardEntries: [...prev.inwardEntries, e] }));
  const addItem = (i: Item) => setState(prev => ({ ...prev, items: [...prev.items, i] }));
  const syncAndRefresh = (newState: AppState) => setState(newState);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-safe-bottom">
      <header className="bg-white border-b px-4 py-3 sticky top-0 z-40 flex justify-between items-center no-print"><h1 className="text-xl font-black tracking-tight">{tab === 'outward' ? 'Outward Entry' : tab === 'inward' ? 'Inward Entry' : tab === 'recon' ? 'Reconciliation' : 'Setup'}</h1><div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs border border-blue-200">JW</div></header>
      <main className="w-full max-w-xl mx-auto">
        {tab === 'masters' && <Masters vendors={state.vendors} setVendors={(v:any)=>update('vendors',v)} items={state.items} setItems={(i:any)=>update('items',i)} workTypes={state.workTypes} setWorkTypes={(w:any)=>update('workTypes',w)} />}
        {tab === 'outward' && <Outward state={state} onSave={addOut} onAddItem={addItem} />}
        {tab === 'inward' && <Inward state={state} onSave={addIn} />}
        {tab === 'recon' && <Report state={state} syncAndRefresh={syncAndRefresh} />}
      </main>
      <TabBar currentTab={tab} setTab={setTab} />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<React.StrictMode><App /></React.StrictMode>);