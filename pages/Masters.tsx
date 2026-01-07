import React, { useState } from 'react';
import { Vendor, Item, WorkType, AppState } from '../types';
import { Button, Input, Card } from '../components/ui';
import { Trash2, FileDown, Upload, Settings } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { exportToCSV, parseCSV } from '../services/csv';

interface MastersProps {
  state: AppState;
  updateState: (k: keyof AppState, v: any) => void;
}

const Masters: React.FC<MastersProps> = ({ state, updateState }) => {
  const [activeSection, setActiveSection] = useState<'vendors' | 'items' | 'work' | 'config'>('vendors');
  
  // Local state for forms
  const [newVendor, setNewVendor] = useState({ name: '', code: '' });
  const [newItem, setNewItem] = useState({ sku: '', description: '' });
  const [newWork, setNewWork] = useState({ name: '' });
  
  // Config state
  const [apiKey, setApiKey] = useState(localStorage.getItem('GOOGLE_API_KEY') || '');
  const [clientId, setClientId] = useState(localStorage.getItem('GOOGLE_CLIENT_ID') || '');

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

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>, type: 'vendors' | 'items' | 'workTypes') => {
    if(e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        const data = parseCSV(text);
        const newData = data.map(d => ({ ...d, id: uuidv4(), synced: false }));
        // Merge without duplicates (based on Code/SKU/Name)
        let merged: any[] = [];
        if (type === 'vendors') {
           merged = [...state.vendors, ...newData.filter(n => !state.vendors.some(e => e.code === n.code))];
        } else if (type === 'items') {
           merged = [...state.items, ...newData.filter(n => !state.items.some(e => e.sku === n.sku))];
        } else {
           merged = [...state.workTypes, ...newData.filter(n => !state.workTypes.some(e => e.name === n.name))];
        }
        updateState(type, merged);
        alert(`Imported ${newData.length} records.`);
      };
      reader.readAsText(e.target.files[0]);
    }
  };

  return (
    <div className="pb-24 max-w-xl mx-auto">
      <div className="flex space-x-2 mb-4 p-4 overflow-x-auto">
        {['vendors', 'items', 'work', 'config'].map((sec) => (
          <button
            key={sec}
            onClick={() => setActiveSection(sec as any)}
            className={`px-4 py-2 rounded-full whitespace-nowrap capitalize ${activeSection === sec ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            {sec}
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
          <Card title="Data Management">
             <div className="grid grid-cols-2 gap-4">
                <Button variant="secondary" onClick={() => exportToCSV(state.outwardEntries, 'outward_vouchers')} className="text-xs"><FileDown size={14} className="mr-2"/> Exp. Outward</Button>
                <Button variant="secondary" onClick={() => exportToCSV(state.inwardEntries, 'inward_vouchers')} className="text-xs"><FileDown size={14} className="mr-2"/> Exp. Inward</Button>
             </div>
          </Card>
        </div>
      )}

      {activeSection === 'vendors' && (
        <div className="px-4">
          <Card title="Manage Vendors">
            <div className="flex gap-2 mb-4">
              <label className="flex-1 bg-slate-100 border border-slate-200 rounded-xl p-3 flex justify-center items-center text-sm font-bold text-slate-600 cursor-pointer">
                 <Upload size={16} className="mr-2"/> Import CSV
                 <input type="file" className="hidden" accept=".csv" onChange={e => handleImport(e, 'vendors')} />
              </label>
              <Button variant="secondary" className="flex-1 text-sm" onClick={() => exportToCSV(state.vendors, 'vendors')}><FileDown size={16} className="mr-2"/> Export CSV</Button>
            </div>
            <div className="border-t pt-4">
              <div className="grid grid-cols-2 gap-2">
                <Input label="Name" value={newVendor.name} onChange={e => setNewVendor({...newVendor, name: e.target.value})} placeholder="e.g. Acme Corp" />
                <Input label="Code" value={newVendor.code} onChange={e => setNewVendor({...newVendor, code: e.target.value.toUpperCase()})} placeholder="e.g. ACME" />
              </div>
              <Button onClick={addVendor} disabled={!newVendor.name || !newVendor.code}>Add Vendor</Button>
            </div>
          </Card>
          <div className="space-y-2">
            {state.vendors.map(v => (
              <div key={v.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center">
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
            <div className="flex gap-2 mb-4">
              <label className="flex-1 bg-slate-100 border border-slate-200 rounded-xl p-3 flex justify-center items-center text-sm font-bold text-slate-600 cursor-pointer">
                 <Upload size={16} className="mr-2"/> Import CSV
                 <input type="file" className="hidden" accept=".csv" onChange={e => handleImport(e, 'items')} />
              </label>
              <Button variant="secondary" className="flex-1 text-sm" onClick={() => exportToCSV(state.items, 'items')}><FileDown size={16} className="mr-2"/> Export CSV</Button>
            </div>
            <div className="border-t pt-4">
               <Input label="SKU Code" value={newItem.sku} onChange={e => setNewItem({...newItem, sku: e.target.value})} placeholder="e.g. ITEM-001" />
               <Button onClick={addItem} disabled={!newItem.sku}>Add Item</Button>
            </div>
          </Card>
          <div className="space-y-2">
            {state.items.map(i => (
              <div key={i.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center">
                <div>
                  <div className="font-bold flex items-center">{i.sku} {!i.synced && <span className="ml-2 w-2 h-2 rounded-full bg-orange-400" />}</div>
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
            <div className="flex gap-2 mb-4">
              <label className="flex-1 bg-slate-100 border border-slate-200 rounded-xl p-3 flex justify-center items-center text-sm font-bold text-slate-600 cursor-pointer">
                 <Upload size={16} className="mr-2"/> Import CSV
                 <input type="file" className="hidden" accept=".csv" onChange={e => handleImport(e, 'workTypes')} />
              </label>
              <Button variant="secondary" className="flex-1 text-sm" onClick={() => exportToCSV(state.workTypes, 'work_types')}><FileDown size={16} className="mr-2"/> Export CSV</Button>
            </div>
            <div className="border-t pt-4">
               <Input label="Work Name" value={newWork.name} onChange={e => setNewWork({...newWork, name: e.target.value})} placeholder="e.g. Polishing" />
               <Button onClick={addWork} disabled={!newWork.name}>Add Work Type</Button>
            </div>
          </Card>
          <div className="space-y-2">
            {state.workTypes.map(w => (
              <div key={w.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center">
                <div className="font-bold flex items-center">{w.name} {!w.synced && <span className="ml-2 w-2 h-2 rounded-full bg-orange-400" />}</div>
                <button onClick={() => updateState('workTypes', state.workTypes.filter(x => x.id !== w.id))} className="text-red-500 p-2"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Masters;