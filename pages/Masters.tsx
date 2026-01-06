import React, { useState } from 'react';
import { Vendor, Item, WorkType } from '../types';
import { Button, Input, Card } from '../components/ui';
import { Trash2, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface MastersProps {
  vendors: Vendor[];
  setVendors: (v: Vendor[]) => void;
  items: Item[];
  setItems: (i: Item[]) => void;
  workTypes: WorkType[];
  setWorkTypes: (w: WorkType[]) => void;
}

const Masters: React.FC<MastersProps> = ({ vendors, setVendors, items, setItems, workTypes, setWorkTypes }) => {
  const [activeSection, setActiveSection] = useState<'vendors' | 'items' | 'work'>('vendors');
  
  // Local state for forms
  const [newVendor, setNewVendor] = useState({ name: '', code: '' });
  const [newItem, setNewItem] = useState({ sku: '', description: '' });
  const [newWork, setNewWork] = useState({ name: '' });

  const addVendor = () => {
    if (!newVendor.name || !newVendor.code) return;
    setVendors([...vendors, { id: uuidv4(), ...newVendor, synced: false }]);
    setNewVendor({ name: '', code: '' });
  };

  const addItem = () => {
    if (!newItem.sku) return;
    setItems([...items, { id: uuidv4(), ...newItem, synced: false }]);
    setNewItem({ sku: '', description: '' });
  };

  const addWork = () => {
    if (!newWork.name) return;
    setWorkTypes([...workTypes, { id: uuidv4(), ...newWork, synced: false }]);
    setNewWork({ name: '' });
  };

  return (
    <div className="pb-24 max-w-xl mx-auto">
      <div className="flex space-x-2 mb-4 p-4 overflow-x-auto">
        {['vendors', 'items', 'work'].map((sec) => (
          <button
            key={sec}
            onClick={() => setActiveSection(sec as any)}
            className={`px-4 py-2 rounded-full whitespace-nowrap ${activeSection === sec ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            {sec.charAt(0).toUpperCase() + sec.slice(1)}
          </button>
        ))}
      </div>

      {activeSection === 'vendors' && (
        <div className="px-4">
          <Card title="Add Vendor">
            <div className="grid grid-cols-2 gap-2">
              <Input label="Name" value={newVendor.name} onChange={e => setNewVendor({...newVendor, name: e.target.value})} placeholder="e.g. Acme Corp" />
              <Input label="Code" value={newVendor.code} onChange={e => setNewVendor({...newVendor, code: e.target.value.toUpperCase()})} placeholder="e.g. ACME" />
            </div>
            <Button onClick={addVendor} disabled={!newVendor.name || !newVendor.code}>Add Vendor</Button>
          </Card>
          <div className="space-y-2">
            {vendors.map(v => (
              <div key={v.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center">
                <div>
                  <div className="font-bold flex items-center">
                    {v.name}
                    {!v.synced && <span className="ml-2 w-2 h-2 rounded-full bg-orange-400" title="Not Synced"></span>}
                  </div>
                  <div className="text-xs text-slate-500">Code: {v.code}</div>
                </div>
                <button onClick={() => setVendors(vendors.filter(x => x.id !== v.id))} className="text-red-500 p-2"><Trash2 size={18} /></button>
              </div>
            ))}
            {vendors.length === 0 && <p className="text-center text-slate-400 py-4">No vendors added.</p>}
          </div>
        </div>
      )}

      {activeSection === 'items' && (
        <div className="px-4">
          <Card title="Add Item (SKU)">
            <Input label="SKU Code" value={newItem.sku} onChange={e => setNewItem({...newItem, sku: e.target.value})} placeholder="e.g. ITEM-001" />
            <Input label="Description" value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} placeholder="Optional description" />
            <Button onClick={addItem} disabled={!newItem.sku}>Add Item</Button>
          </Card>
          <div className="space-y-2">
            {items.map(i => (
              <div key={i.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center">
                <div>
                  <div className="font-bold flex items-center">
                    {i.sku}
                    {!i.synced && <span className="ml-2 w-2 h-2 rounded-full bg-orange-400" title="Not Synced"></span>}
                  </div>
                  <div className="text-xs text-slate-500">{i.description}</div>
                </div>
                <button onClick={() => setItems(items.filter(x => x.id !== i.id))} className="text-red-500 p-2"><Trash2 size={18} /></button>
              </div>
            ))}
            {items.length === 0 && <p className="text-center text-slate-400 py-4">No items added.</p>}
          </div>
        </div>
      )}

      {activeSection === 'work' && (
        <div className="px-4">
          <Card title="Add Work Type">
            <Input label="Work Name" value={newWork.name} onChange={e => setNewWork({...newWork, name: e.target.value})} placeholder="e.g. Polishing" />
            <Button onClick={addWork} disabled={!newWork.name}>Add Work Type</Button>
          </Card>
          <div className="space-y-2">
            {workTypes.map(w => (
              <div key={w.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center">
                <div className="font-bold flex items-center">
                  {w.name}
                  {!w.synced && <span className="ml-2 w-2 h-2 rounded-full bg-orange-400" title="Not Synced"></span>}
                </div>
                <button onClick={() => setWorkTypes(workTypes.filter(x => x.id !== w.id))} className="text-red-500 p-2"><Trash2 size={18} /></button>
              </div>
            ))}
             {workTypes.length === 0 && <p className="text-center text-slate-400 py-4">No work types added.</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default Masters;