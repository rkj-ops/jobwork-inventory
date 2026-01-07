import React, { useState } from 'react';
import { Vendor, Item, WorkType, AppState, OutwardEntry, InwardEntry } from '../types';
import { Button, Input, Card } from '../components/ui';
import { Trash2, FileDown, Upload, Settings, Database, Download, Lock } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { exportToCSV, parseCSV, downloadTemplate } from '../services/csv';

interface MastersProps {
  state: AppState;
  updateState: (k: keyof AppState, v: any) => void;
}

const Masters: React.FC<MastersProps> = ({ state, updateState }) => {
  const [activeSection, setActiveSection] = useState<'vendors' | 'items' | 'work' | 'users' | 'data' | 'config'>('data');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [login, setLogin] = useState({ user: '', pass: '' });
  
  // Local state for forms
  const [newVendor, setNewVendor] = useState({ name: '', code: '' });
  const [newItem, setNewItem] = useState({ sku: '', description: '' });
  const [newWork, setNewWork] = useState({ name: '' });
  const [newUser, setNewUser] = useState({ name: '' });
  
  // Config state
  const [apiKey, setApiKey] = useState(localStorage.getItem('GOOGLE_API_KEY') || '');
  const [clientId, setClientId] = useState(localStorage.getItem('GOOGLE_CLIENT_ID') || '');

  const handleLogin = () => {
    if (login.user === 'ADMIN' && login.pass === 'Rajkamal@1') {
        setIsAuthenticated(true);
    } else {
        alert("Invalid Username or Password");
    }
  };

  const saveConfig = () => {
    localStorage.setItem('GOOGLE_API_KEY', apiKey);
    localStorage.setItem('GOOGLE_CLIENT_ID', clientId);
    alert('Configuration Saved');
  };

  const addVendor = () => {
    if (!newVendor.name || !newVendor.code) return;
    updateState('vendors', [...state.vendors, { id: uuidv4(), ...newVendor, synced: false }]);
    setNewVendor({ name: '', code: '' });
  };

  const addItem = () => {
    if (!newItem.sku) return;
    updateState('items', [...state.items, { id: uuidv4(), ...newItem, synced: false }]);
    setNewItem({ sku: '', description: '' });
  };

  const addWork = () => {
    if (!newWork.name) return;
    updateState('workTypes', [...state.workTypes, { id: uuidv4(), ...newWork, synced: false }]);
    setNewWork({ name: '' });
  };

  const addUser = () => {
    if (!newUser.name) return;
    updateState('users', [...state.users, { id: uuidv4(), ...newUser, synced: false }]);
    setNewUser({ name: '' });
  };

  const handleImportMasters = (e: React.ChangeEvent<HTMLInputElement>, type: 'vendors' | 'items' | 'workTypes' | 'users') => {
    if(e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        const data = parseCSV(text);
        const newData = data.map(d => ({ ...d, id: uuidv4(), synced: false }));
        
        let merged: any[] = [];
        let count = 0;

        if (type === 'vendors') {
           const valid = newData.filter((n: any) => n.Name && n.Code);
           merged = [...state.vendors, ...valid.filter((n: any) => !state.vendors.some(e => e.code === n.Code)).map((n:any) => ({ id: uuidv4(), name: n.Name, code: n.Code, synced: false }))];
           count = valid.length;
        } else if (type === 'items') {
           const valid = newData.filter((n: any) => n.SKU);
           merged = [...state.items, ...valid.filter((n: any) => !state.items.some(e => e.sku === n.SKU)).map((n:any) => ({ id: uuidv4(), sku: n.SKU, description: n.Description || '', synced: false }))];
           count = valid.length;
        } else if (type === 'workTypes') {
           const valid = newData.filter((n: any) => n.Name);
           merged = [...state.workTypes, ...valid.filter((n: any) => !state.workTypes.some(e => e.name === n.Name)).map((n:any) => ({ id: uuidv4(), name: n.Name, synced: false }))];
           count = valid.length;
        } else if (type === 'users') {
           const valid = newData.filter((n: any) => n.Name);
           merged = [...state.users, ...valid.filter((n: any) => !state.users.some(e => e.name === n.Name)).map((n:any) => ({ id: uuidv4(), name: n.Name, synced: false }))];
           count = valid.length;
        }
        
        updateState(type, merged);
        alert(`Imported ${count} records successfully.`);
      };
      reader.readAsText(e.target.files[0]);
    }
  };

  const handleImportEntries = (e: React.ChangeEvent<HTMLInputElement>, type: 'outward' | 'inward') => {
    if(e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        const data = parseCSV(text);
        let successCount = 0;
        let failCount = 0;
        let duplicateCount = 0;

        if (type === 'outward') {
            const newEntries: OutwardEntry[] = [];
            data.forEach((row: any) => {
                const existing = state.outwardEntries.find(o => o.challanNo === row.ChallanNo);
                if (existing) {
                    duplicateCount++;
                    return;
                }
                const vendor = state.vendors.find(v => v.code === row.VendorCode);
                const item = state.items.find(i => i.sku === row.SKU);
                const work = state.workTypes.find(w => w.name === row.WorkName);
                
                if (vendor && item) {
                    newEntries.push({
                        id: uuidv4(),
                        date: row.Date ? new Date(row.Date).toISOString() : new Date().toISOString(),
                        vendorId: vendor.id,
                        skuId: item.id,
                        challanNo: row.ChallanNo || 'IMP-' + Math.floor(Math.random()*1000),
                        qty: Number(row.Qty) || 0,
                        comboQty: Number(row.ComboQty) || 0,
                        totalWeight: Number(row.TotalWt) || 0,
                        pendalWeight: Number(row.PendalWt) || 0,
                        materialWeight: (Number(row.TotalWt) || 0) - (Number(row.PendalWt) || 0),
                        workId: work?.id || '',
                        remarks: row.Remarks || 'Imported',
                        status: 'OPEN',
                        synced: false
                    });
                    successCount++;
                } else {
                    failCount++;
                }
            });
            updateState('outwardEntries', [...state.outwardEntries, ...newEntries]);
        } else {
            const newEntries: InwardEntry[] = [];
            data.forEach((row: any) => {
                const vendor = state.vendors.find(v => v.code === row.VendorCode);
                const item = state.items.find(i => i.sku === row.SKU);
                const outChallan = state.outwardEntries.find(o => o.challanNo === row.OutwardChallanNo);

                if (vendor && item) {
                    newEntries.push({
                        id: uuidv4(),
                        date: row.Date ? new Date(row.Date).toISOString() : new Date().toISOString(),
                        vendorId: vendor.id,
                        outwardChallanId: outChallan?.id || '', 
                        skuId: item.id,
                        qty: Number(row.Qty) || 0,
                        comboQty: Number(row.ComboQty) || 0,
                        totalWeight: Number(row.TotalWt) || 0,
                        pendalWeight: Number(row.PendalWt) || 0,
                        materialWeight: (Number(row.TotalWt) || 0) - (Number(row.PendalWt) || 0),
                        remarks: row.Remarks || 'Imported',
                        synced: false
                    });
                    successCount++;
                } else {
                    failCount++;
                }
            });
            updateState('inwardEntries', [...state.inwardEntries, ...newEntries]);
        }

        alert(`Imported ${successCount} entries. ${failCount} failed. ${duplicateCount} duplicates skipped.`);
      };
      reader.readAsText(e.target.files[0]);
    }
  };

  if (!isAuthenticated) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-4">
           <Card title="Admin Login" className="w-full max-w-sm">
              <div className="mb-4">
                 <Input label="Username" value={login.user} onChange={e => setLogin({...login, user: e.target.value})} placeholder="Enter Username" />
                 <Input label="Password" type="password" value={login.pass} onChange={e => setLogin({...login, pass: e.target.value})} placeholder="Enter Password" />
              </div>
              <Button onClick={handleLogin}><Lock size={16} className="mr-2"/> Login</Button>
           </Card>
        </div>
      );
  }

  return (
    <div className="pb-24 max-w-xl mx-auto">
      <div className="flex space-x-2 mb-4 p-4 overflow-x-auto no-scrollbar">
        {['data', 'vendors', 'items', 'work', 'users', 'config'].map((sec) => (
          <button
            key={sec}
            onClick={() => setActiveSection(sec as any)}
            className={`px-4 py-2 rounded-full whitespace-nowrap capitalize text-sm font-bold shadow-sm transition-colors ${activeSection === sec ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            {sec === 'data' ? 'Data Tools' : sec}
          </button>
        ))}
      </div>

      {activeSection === 'config' && (
        <div className="px-4">
          <Card title="Google API Configuration">
            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 text-xs text-yellow-800 mb-4">
              <strong>Note:</strong> Required for syncing with Google Sheets.
            </div>
            <Input label="Client ID" value={clientId} onChange={e => setClientId(e.target.value)} />
            <Input label="API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} />
            <Button onClick={saveConfig} className="mt-2"><Settings size={18} className="mr-2"/> Save Config</Button>
          </Card>
        </div>
      )}

      {activeSection === 'data' && (
        <div className="px-4 space-y-4">
           <Card title="Import/Export Masters">
             <p className="text-xs text-slate-400 mb-4">Upload CSV files to bulk add masters. Download templates to see the required format.</p>
             
             {['vendors', 'items', 'workTypes', 'users'].map((t) => (
                <div key={t} className="flex items-center gap-2 mb-3 pb-3 border-b last:border-0 last:pb-0">
                    <div className="w-24 text-sm font-bold capitalize text-slate-600">{t.replace('Types','')}</div>
                    <button onClick={() => downloadTemplate(t as any)} className="p-2 text-blue-600 bg-blue-50 rounded-lg text-xs font-bold hover:bg-blue-100"><Download size={14} className="inline mr-1"/> Template</button>
                    <label className="flex-1 text-center p-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 cursor-pointer hover:bg-slate-200">
                        <Upload size={14} className="inline mr-1"/> Import
                        <input type="file" className="hidden" accept=".csv" onChange={e => handleImportMasters(e, t as any)} />
                    </label>
                </div>
             ))}
           </Card>

           <Card title="Import Entries">
             <p className="text-xs text-slate-400 mb-4">Bulk import historical data. Ensure Master Codes/SKUs match exactly.</p>
             <div className="flex items-center gap-2 mb-3 pb-3 border-b">
                 <div className="w-24 text-sm font-bold text-slate-600">Outward</div>
                 <button onClick={() => downloadTemplate('outward')} className="p-2 text-blue-600 bg-blue-50 rounded-lg text-xs font-bold hover:bg-blue-100"><Download size={14} className="inline mr-1"/> Template</button>
                 <label className="flex-1 text-center p-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 cursor-pointer hover:bg-slate-200">
                    <Upload size={14} className="inline mr-1"/> Import CSV
                    <input type="file" className="hidden" accept=".csv" onChange={e => handleImportEntries(e, 'outward')} />
                 </label>
             </div>
             <div className="flex items-center gap-2">
                 <div className="w-24 text-sm font-bold text-slate-600">Inward</div>
                 <button onClick={() => downloadTemplate('inward')} className="p-2 text-blue-600 bg-blue-50 rounded-lg text-xs font-bold hover:bg-blue-100"><Download size={14} className="inline mr-1"/> Template</button>
                 <label className="flex-1 text-center p-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 cursor-pointer hover:bg-slate-200">
                    <Upload size={14} className="inline mr-1"/> Import CSV
                    <input type="file" className="hidden" accept=".csv" onChange={e => handleImportEntries(e, 'inward')} />
                 </label>
             </div>
           </Card>
        </div>
      )}

      {activeSection === 'vendors' && (
        <div className="px-4">
          <Card title="Manage Vendors">
            <div className="grid grid-cols-2 gap-2 mb-4">
                <Input label="Name" value={newVendor.name} onChange={e => setNewVendor({...newVendor, name: e.target.value})} placeholder="e.g. Acme Corp" />
                <Input label="Code" value={newVendor.code} onChange={e => setNewVendor({...newVendor, code: e.target.value.toUpperCase()})} placeholder="e.g. ACME" />
            </div>
            <Button onClick={addVendor} disabled={!newVendor.name || !newVendor.code}>Add Vendor</Button>
          </Card>
          <div className="space-y-2">
            {state.vendors.map(v => (
              <div key={v.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm">
                <div>
                  <div className="font-bold flex items-center">{v.name} {!v.synced && <span className="ml-2 w-2 h-2 rounded-full bg-orange-400" />}</div>
                  <div className="text-xs text-slate-500">Code: {v.code}</div>
                </div>
                <button onClick={() => updateState('vendors', state.vendors.filter(x => x.id !== v.id))} className="text-red-500 p-2"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'items' && (
        <div className="px-4">
          <Card title="Manage Items">
            <div className="mb-4">
               <Input label="SKU Code" value={newItem.sku} onChange={e => setNewItem({...newItem, sku: e.target.value})} placeholder="e.g. ITEM-001" />
               <Input label="Description" value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} placeholder="Description" className="mt-2" />
            </div>
            <Button onClick={addItem} disabled={!newItem.sku}>Add Item</Button>
          </Card>
          <div className="space-y-2">
            {state.items.map(i => (
              <div key={i.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm">
                <div>
                  <div className="font-bold flex items-center">{i.sku} {!i.synced && <span className="ml-2 w-2 h-2 rounded-full bg-orange-400" />}</div>
                  <div className="text-xs text-slate-500">{i.description}</div>
                </div>
                <button onClick={() => updateState('items', state.items.filter(x => x.id !== i.id))} className="text-red-500 p-2"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'work' && (
        <div className="px-4">
           <Card title="Manage Work Types">
            <div className="mb-4">
               <Input label="Work Name" value={newWork.name} onChange={e => setNewWork({...newWork, name: e.target.value})} placeholder="e.g. Polishing" />
            </div>
            <Button onClick={addWork} disabled={!newWork.name}>Add Work Type</Button>
          </Card>
          <div className="space-y-2">
            {state.workTypes.map(w => (
              <div key={w.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm">
                <div className="font-bold flex items-center">{w.name} {!w.synced && <span className="ml-2 w-2 h-2 rounded-full bg-orange-400" />}</div>
                <button onClick={() => updateState('workTypes', state.workTypes.filter(x => x.id !== w.id))} className="text-red-500 p-2"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'users' && (
        <div className="px-4">
           <Card title="Manage Users">
            <div className="mb-4">
               <Input label="User Name" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} placeholder="e.g. John Doe" />
            </div>
            <Button onClick={addUser} disabled={!newUser.name}>Add User</Button>
          </Card>
          <div className="space-y-2">
            {state.users.map(u => (
              <div key={u.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm">
                <div className="font-bold flex items-center">{u.name} {!u.synced && <span className="ml-2 w-2 h-2 rounded-full bg-orange-400" />}</div>
                <button onClick={() => updateState('users', state.users.filter(x => x.id !== u.id))} className="text-red-500 p-2"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Masters;