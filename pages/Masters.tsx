import React, { useState } from 'react';
import { Vendor, Item, WorkType, AppState, OutwardEntry, InwardEntry, formatDisplayDate } from '../types';
import { Button, Input, Card } from '../components/ui';
import { Trash2, FileDown, Upload, Settings, Database, Download, Lock, BarChart3 } from 'lucide-react';
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
  
  const [newVendor, setNewVendor] = useState({ name: '', code: '' });
  const [newItem, setNewItem] = useState({ sku: '', description: '' });
  const [newWork, setNewWork] = useState({ name: '' });
  const [newUser, setNewUser] = useState({ name: '' });
  
  const [apiKey, setApiKey] = useState(localStorage.getItem('GOOGLE_API_KEY') || '');
  const [clientId, setClientId] = useState(localStorage.getItem('GOOGLE_CLIENT_ID') || '');

  const handleLogin = () => {
    if (login.user === 'ADMIN' && login.pass === 'Rajkamal@1') {
        setIsAuthenticated(true);
    } else {
        alert("Invalid Username or Password");
    }
  };

  const handleDownloadReconReport = () => {
    // 20 Columns strictly ordered from A to T:
    const reportData = state.outwardEntries.map(o => {
        const ins = state.inwardEntries.filter(i => i.outwardChallanId === o.id);
        const inQty = ins.reduce((s, i) => s + i.qty, 0);
        const inCombo = ins.reduce((s, i) => s + (i.comboQty ?? 0), 0);
        const twRec = ins.reduce((s, i) => s + i.totalWeight, 0);
        
        const vendor = state.vendors.find(v => v.id === o.vendorId);
        const item = state.items.find(i => i.id === o.skuId);
        const work = state.workTypes.find(w => w.id === o.workId);
        
        const isMarkedClosed = o.status === 'COMPLETED';
        const isActuallyDone = inQty >= o.qty && o.qty > 0;
        
        let statusStr = 'pending';
        if (isMarkedClosed) {
            statusStr = o.qty > inQty ? 'short qty completed' : 'complete';
        } else if (isActuallyDone) {
            statusStr = 'complete';
        }

        // Fix: Explicitly type the Set to string to avoid 'unknown' inference in map
        const recvDatesStr = Array.from(new Set<string>(ins.map(i => i.date.split('T')[0])))
            .sort()
            .map(d => formatDisplayDate(d))
            .join('; ');
        
        const inwardCheckedBy = Array.from(new Set(ins.map(i => i.checkedBy).filter(Boolean))).join('; ');
        const inwardRemarks = ins.map(i => i.remarks).filter(Boolean).join(' | ');

        return {
            'status(complete/pending/short qty completed)': statusStr,
            'vendor': vendor?.name || 'Unknown',
            'sent date': formatDisplayDate(o.date),
            'recieved date': recvDatesStr || '---',
            'challan no.': o.challanNo,
            'work done': work?.name || '',
            'sku': item?.sku || 'Unknown',
            'qty sent': o.qty,
            'qty rec': inQty,
            'short qty': Math.max(0, o.qty - inQty),
            'combo qty sent': o.comboQty ?? 0,
            'combo qty recieved': inCombo,
            'combo qty short': Math.max(0, (o.comboQty ?? 0) - inCombo),
            'TW Sent': o.totalWeight,
            'TW Received': twRec,
            'short/excess weight': (o.totalWeight - twRec).toFixed(3),
            'inward checked by': inwardCheckedBy || '---',
            'inward remarks': inwardRemarks || '---',
            'outward checked by': o.checkedBy || '---',
            'outward remarks': o.remarks || '---'
        };
    });
    
    exportToCSV(reportData, `Reconciliation_Report_${new Date().toISOString().split('T')[0]}`);
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
        let merged: any[] = [];
        let count = 0;
        if (type === 'vendors') {
           const valid = data.filter((n: any) => n.Name && n.Code);
           merged = [...state.vendors, ...valid.filter((n: any) => !state.vendors.some(e => e.code === n.Code)).map((n:any) => ({ id: uuidv4(), name: n.Name, code: n.Code, synced: false }))];
           count = valid.length;
        } else if (type === 'items') {
           const valid = data.filter((n: any) => n.SKU);
           merged = [...state.items, ...valid.filter((n: any) => !state.items.some(e => e.sku === n.SKU)).map((n:any) => ({ id: uuidv4(), sku: n.SKU, description: n.Description || '', synced: false }))];
           count = valid.length;
        } else if (type === 'workTypes') {
           const valid = data.filter((n: any) => n.Name);
           merged = [...state.workTypes, ...valid.filter((n: any) => !state.workTypes.some(e => e.name === n.Name)).map((n:any) => ({ id: uuidv4(), name: n.Name, synced: false }))];
           count = valid.length;
        } else if (type === 'users') {
           const valid = data.filter((n: any) => n.Name);
           merged = [...state.users, ...valid.filter((n: any) => !state.users.some(e => e.name === n.Name)).map((n:any) => ({ id: uuidv4(), name: n.Name, synced: false }))];
           count = valid.length;
        }
        updateState(type, merged);
        alert(`Imported ${count} records successfully.`);
      };
      reader.readAsText(e.target.files[0]);
    }
  };

  if (!isAuthenticated) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
           <Card title="Admin Authorization" className="w-full max-w-sm">
              <div className="mb-4">
                 <Input label="Admin User" value={login.user} onChange={e => setLogin({...login, user: e.target.value.toUpperCase()})} placeholder="Enter Username" />
                 <Input label="Access Key" type="password" value={login.pass} onChange={e => setLogin({...login, pass: e.target.value})} placeholder="Enter Password" />
              </div>
              <Button onClick={handleLogin}><Lock size={16} className="mr-2"/> Authenticate</Button>
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
            className={`px-5 py-2.5 rounded-full whitespace-nowrap capitalize text-xs font-black tracking-tight shadow-sm transition-all ${activeSection === sec ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
          >
            {sec === 'data' ? 'Reconciliation' : sec}
          </button>
        ))}
      </div>

      {activeSection === 'data' && (
        <div className="px-4 space-y-4">
           <Card title="Report Generation">
              <Button onClick={handleDownloadReconReport} variant="primary" className="mb-3 py-4">
                 <BarChart3 size={20} className="mr-3"/> Export Reconciliation Report (CSV)
              </Button>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Column Order (A-T)</h4>
                <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
                  Status, Vendor, Sent Date, Recv Date, Challan, Work, SKU, Qty Sent, Qty Rec, Short Qty, Combo Sent, Combo Rec, Combo Short, TW Sent, TW Rec, Wt Diff, Inward Check, Inward Rem, Outward Check, Outward Rem.
                </p>
              </div>
           </Card>

           <Card title="Bulk Master Import">
             <p className="text-[11px] text-slate-400 mb-5">Select a category to import via CSV template.</p>
             {['vendors', 'items', 'workTypes', 'users'].map((t) => (
                <div key={t} className="flex items-center gap-3 mb-4 pb-4 border-b last:border-0 last:pb-0 border-slate-50">
                    <div className="w-20 text-[11px] font-black uppercase tracking-wider text-slate-400">{t.replace('Types','')}</div>
                    <button onClick={() => downloadTemplate(t as any)} className="p-2.5 text-blue-600 bg-blue-50 rounded-xl text-[10px] font-black hover:bg-blue-100 transition-colors uppercase"><Download size={12} className="inline mr-1.5"/> Template</button>
                    <label className="flex-1 text-center p-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 cursor-pointer hover:bg-slate-50 transition-colors uppercase">
                        <Upload size={12} className="inline mr-1.5"/> Import
                        <input type="file" className="hidden" accept=".csv" onChange={e => handleImportMasters(e, t as any)} />
                    </label>
                </div>
             ))}
           </Card>
        </div>
      )}

      {activeSection === 'config' && (
        <div className="px-4">
          <Card title="Cloud Infrastructure">
            <Input label="Google Client ID" value={clientId} onChange={e => setClientId(e.target.value)} />
            <Input label="Google API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} />
            <Button onClick={saveConfig} className="mt-2"><Settings size={18} className="mr-2"/> Save Credentials</Button>
          </Card>
        </div>
      )}

      {activeSection === 'vendors' && (
        <div className="px-4">
          <Card title="New Vendor Registration">
            <div className="grid grid-cols-2 gap-3 mb-4">
                <Input label="Company Name" value={newVendor.name} onChange={e => setNewVendor({...newVendor, name: e.target.value})} placeholder="Acme Corp" />
                <Input label="Vendor Code" value={newVendor.code} onChange={e => setNewVendor({...newVendor, code: e.target.value.toUpperCase()})} placeholder="ACM" />
            </div>
            <Button onClick={addVendor} disabled={!newVendor.name || !newVendor.code}>Register Vendor</Button>
          </Card>
          <div className="space-y-2">
            {state.vendors.map(v => (
              <div key={v.id} className="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                <div>
                  <div className="font-bold text-slate-700 flex items-center">{v.name} {!v.synced && <span className="ml-2 w-1.5 h-1.5 rounded-full bg-orange-400" />}</div>
                  <div className="text-[10px] font-black text-slate-400 uppercase">{v.code}</div>
                </div>
                <button onClick={() => updateState('vendors', state.vendors.filter(x => x.id !== v.id))} className="text-red-400 p-2 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'items' && (
        <div className="px-4">
          <Card title="New Item Catalog">
            <div className="mb-4">
               <Input label="SKU Identifier" value={newItem.sku} onChange={e => setNewItem({...newItem, sku: e.target.value.toUpperCase()})} placeholder="ITEM-001" />
               <Input label="Description (Optional)" value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} placeholder="Product Details" className="mt-2" />
            </div>
            <Button onClick={addItem} disabled={!newItem.sku}>Catalog Item</Button>
          </Card>
          <div className="space-y-2">
            {state.items.map(i => (
              <div key={i.id} className="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                <div>
                  <div className="font-bold text-slate-700 flex items-center">{i.sku} {!i.synced && <span className="ml-2 w-1.5 h-1.5 rounded-full bg-orange-400" />}</div>
                  <div className="text-[10px] text-slate-400 italic">{i.description || 'No description'}</div>
                </div>
                <button onClick={() => updateState('items', state.items.filter(x => x.id !== i.id))} className="text-red-400 p-2 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'work' && (
        <div className="px-4">
           <Card title="Work Processes">
            <Input label="Process Name" value={newWork.name} onChange={e => setNewWork({...newWork, name: e.target.value})} placeholder="Polishing" />
            <Button onClick={addWork} disabled={!newWork.name}>Add Process</Button>
          </Card>
          <div className="space-y-2">
            {state.workTypes.map(w => (
              <div key={w.id} className="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                <div className="font-bold text-slate-700 flex items-center">{w.name} {!w.synced && <span className="ml-2 w-1.5 h-1.5 rounded-full bg-orange-400" />}</div>
                <button onClick={() => updateState('workTypes', state.workTypes.filter(x => x.id !== w.id))} className="text-red-400 p-2 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'users' && (
        <div className="px-4">
           <Card title="System Operators">
            <Input label="Operator Name" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} placeholder="John Smith" />
            <Button onClick={addUser} disabled={!newUser.name}>Add Operator</Button>
          </Card>
          <div className="space-y-2">
            {state.users.map(u => (
              <div key={u.id} className="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                <div className="font-bold text-slate-700 flex items-center">{u.name} {!u.synced && <span className="ml-2 w-1.5 h-1.5 rounded-full bg-orange-400" />}</div>
                <button onClick={() => updateState('users', state.users.filter(x => x.id !== u.id))} className="text-red-400 p-2 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Masters;