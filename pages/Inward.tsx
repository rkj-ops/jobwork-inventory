import React, { useState, useMemo } from 'react';
import { AppState, InwardEntry } from '../types';
import { Button, Input, Select, Card } from '../components/ui';
import { Save, AlertCircle, Plus, Clock } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface InwardProps {
  state: AppState;
  onSave: (entry: InwardEntry) => void;
}

const Inward: React.FC<InwardProps> = ({ state, onSave }) => {
  const today = new Date().toISOString().split('T')[0];
  
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectedOutwardId, setSelectedOutwardId] = useState('');
  
  // The outward entry we are returning against
  const selectedOutward = state.outwardEntries.find(e => e.id === selectedOutwardId);

  const [formData, setFormData] = useState({
    date: today,
    qty: '',
    totalWeight: '',
    pendalWeight: '',
    materialWeight: '',
    remarks: ''
  });

  // Pre-fill when outward entry is selected
  React.useEffect(() => {
    if (selectedOutward) {
      setFormData({
        date: today,
        qty: selectedOutward.qty.toString(),
        totalWeight: selectedOutward.totalWeight.toString(),
        pendalWeight: selectedOutward.pendalWeight.toString(),
        materialWeight: selectedOutward.materialWeight.toString(),
        remarks: ''
      });
    }
  }, [selectedOutward]);

  // Auto calc material weight on inward too
   React.useEffect(() => {
    const total = parseFloat(formData.totalWeight) || 0;
    const pendal = parseFloat(formData.pendalWeight) || 0;
    if (total > 0) {
      setFormData(prev => ({
        ...prev,
        materialWeight: (total - pendal).toFixed(3)
      }));
    }
  }, [formData.totalWeight, formData.pendalWeight]);


  // Filter Outward entries that are not fully returned
  const pendingOutwards = state.outwardEntries.filter(e => {
    if (e.vendorId !== selectedVendorId) return false;
    // Calculate if fully returned
    const returnedQty = state.inwardEntries
      .filter(i => i.outwardChallanId === e.id)
      .reduce((sum, i) => sum + i.qty, 0);
    return returnedQty < e.qty;
  });

  const handleSubmit = () => {
    if (!selectedOutwardId || !formData.qty) {
      alert("Please select a challan and enter quantity");
      return;
    }

    const newEntry: InwardEntry = {
      id: uuidv4(),
      date: new Date(formData.date).toISOString(),
      vendorId: selectedVendorId,
      outwardChallanId: selectedOutwardId,
      skuId: selectedOutward?.skuId || '',
      qty: parseFloat(formData.qty),
      totalWeight: parseFloat(formData.totalWeight) || 0,
      pendalWeight: parseFloat(formData.pendalWeight) || 0,
      materialWeight: parseFloat(formData.materialWeight) || 0,
      remarks: formData.remarks,
      synced: false
    };

    onSave(newEntry);
    setFormData({ 
      date: today, 
      qty: '', 
      totalWeight: '', 
      pendalWeight: '', 
      materialWeight: '', 
      remarks: '' 
    });
    setSelectedOutwardId(''); // Reset selection
    // alert("Inward entry saved!");
  };

  const recentEntries = useMemo(() => {
    return state.inwardEntries
      .filter(e => e.date.startsWith(today))
      .reverse();
  }, [state.inwardEntries, today]);

  return (
    <div className="p-4 pb-24 max-w-xl mx-auto">
      <Card title="Select Job Source">
        <Select 
          label="Vendor" 
          value={selectedVendorId} 
          onChange={e => { setSelectedVendorId(e.target.value); setSelectedOutwardId(''); }}
        >
          <option value="">Select Vendor</option>
          {state.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>

        {selectedVendorId && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Pending Outward Challans</label>
            {pendingOutwards.length === 0 ? (
               <div className="text-slate-500 text-sm p-2 border rounded bg-slate-50">No pending challans found.</div>
            ) : (
              <div className="grid gap-2 max-h-40 overflow-y-auto">
                {pendingOutwards.map(out => {
                   const item = state.items.find(i => i.id === out.skuId);
                   return (
                     <div 
                      key={out.id}
                      onClick={() => setSelectedOutwardId(out.id)}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedOutwardId === out.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:bg-slate-50'}`}
                     >
                        <div className="flex justify-between font-semibold text-sm">
                          <span>#{out.challanNo}</span>
                          <span>{new Date(out.date).toLocaleDateString()}</span>
                        </div>
                        <div className="text-xs text-slate-600 mt-1">
                          {item?.sku} - Qty: {out.qty}
                        </div>
                     </div>
                   );
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      {selectedOutward && (
        <Card title={`Receiving for #${selectedOutward.challanNo}`} className="border-t-4 border-t-green-500">
           <Input 
            label="Inward Date" 
            type="date" 
            value={formData.date} 
            onChange={e => setFormData({...formData, date: e.target.value})} 
          />
          
          <div className="grid grid-cols-2 gap-4">
             <Input 
              label="Recv Qty" 
              type="number"
              inputMode="numeric"
              value={formData.qty} 
              onChange={e => setFormData({...formData, qty: e.target.value})} 
            />
            <Input 
              label="Total Wt" 
              type="number" 
              inputMode="decimal"
              value={formData.totalWeight} 
              onChange={e => setFormData({...formData, totalWeight: e.target.value})} 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Pendal Wt" 
              type="number"
              inputMode="decimal"
              value={formData.pendalWeight} 
              onChange={e => setFormData({...formData, pendalWeight: e.target.value})} 
            />
             <Input 
              label="Mat. Wt" 
              type="number"
              className="bg-slate-50"
              readOnly
              value={formData.materialWeight} 
            />
          </div>

          <Input 
            label="Remarks" 
            value={formData.remarks} 
            onChange={e => setFormData({...formData, remarks: e.target.value})} 
            placeholder="Discrepancy notes..."
          />

          <Button onClick={handleSubmit} className="flex justify-center items-center py-4 text-lg">
            <Plus size={24} className="mr-2" />
            Add Entry
          </Button>
        </Card>
      )}

      {selectedVendorId && !selectedOutward && pendingOutwards.length > 0 && (
         <div className="text-center text-slate-500 mt-8">
           <AlertCircle className="mx-auto mb-2 opacity-50" size={32} />
           <p>Select a pending challan above to start receiving.</p>
         </div>
      )}

      {/* Recent Entries Section */}
      {recentEntries.length > 0 && (
        <div className="mt-8">
           <h3 className="text-slate-500 font-semibold mb-2 flex items-center">
            <Clock size={16} className="mr-2" /> Recent Inward Entries (Today)
          </h3>
          <div className="space-y-2">
            {recentEntries.map(entry => {
               const item = state.items.find(i => i.id === entry.skuId);
               const out = state.outwardEntries.find(o => o.id === entry.outwardChallanId);
               return (
                 <div key={entry.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex justify-between items-center">
                   <div>
                     <div className="font-bold text-slate-800">For #{out?.challanNo || '---'}</div>
                     <div className="text-sm text-slate-500">{item?.sku} - Qty: {entry.qty}</div>
                   </div>
                   <div className="text-xs text-slate-400">
                      {entry.synced ? 'Synced' : 'Not Synced'}
                   </div>
                 </div>
               );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Inward;