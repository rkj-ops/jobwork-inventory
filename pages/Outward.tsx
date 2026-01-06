import React, { useState, useEffect, useMemo } from 'react';
import { AppState, OutwardEntry, Item } from '../types';
import { Button, Input, Select, Card } from '../components/ui';
import { Camera, Plus, AlertCircle, Clock } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface OutwardProps {
  state: AppState;
  onSave: (entry: OutwardEntry) => void;
  onAddItem: (item: Item) => void;
}

const Outward: React.FC<OutwardProps> = ({ state, onSave, onAddItem }) => {
  const today = new Date().toISOString().split('T')[0];
  
  const [formData, setFormData] = useState({
    date: today,
    vendorId: '',
    qty: '',
    totalWeight: '',
    pendalWeight: '',
    materialWeight: '',
    workId: '',
    remarks: '',
    photo: ''
  });

  const [skuInput, setSkuInput] = useState('');

  // Calculate Material Weight Automatically
  useEffect(() => {
    const total = parseFloat(formData.totalWeight) || 0;
    const pendal = parseFloat(formData.pendalWeight) || 0;
    if (total > 0) {
      setFormData(prev => ({
        ...prev,
        materialWeight: (total - pendal).toFixed(3)
      }));
    }
  }, [formData.totalWeight, formData.pendalWeight]);

  const generateChallanNo = (vendorId: string): string => {
    if (!vendorId) return '---';
    const vendor = state.vendors.find(v => v.id === vendorId);
    if (!vendor) return '---';
    
    // Count previous outward entries for this vendor to determine sequence
    const vendorEntries = state.outwardEntries.filter(e => e.vendorId === vendorId);
    const nextSeq = vendorEntries.length + 1;
    const seqStr = nextSeq.toString().padStart(3, '0');
    return `${vendor.code}${seqStr}`;
  };

  const challanPreview = useMemo(() => generateChallanNo(formData.vendorId), [formData.vendorId, state.outwardEntries]);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setFormData(prev => ({ ...prev, photo: ev.target?.result as string }));
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleSubmit = () => {
    if (!formData.vendorId || !skuInput || !formData.qty) {
      alert("Please fill required fields (Vendor, SKU, Qty)");
      return;
    }

    // Determine SKU ID
    // Check if entered SKU exists in master
    let finalSkuId = '';
    const existingItem = state.items.find(i => i.sku.toLowerCase() === skuInput.toLowerCase());

    if (existingItem) {
      finalSkuId = existingItem.id;
    } else {
      // Create new Item automatically
      const newItem: Item = {
        id: uuidv4(),
        sku: skuInput.toUpperCase(),
        description: 'Auto-added via Outward',
        synced: false
      };
      onAddItem(newItem);
      finalSkuId = newItem.id;
      // alert(`New Item '${newItem.sku}' added to Master.`);
    }

    const newEntry: OutwardEntry = {
      id: uuidv4(),
      date: new Date(formData.date).toISOString(),
      vendorId: formData.vendorId,
      challanNo: challanPreview,
      skuId: finalSkuId,
      qty: parseFloat(formData.qty),
      totalWeight: parseFloat(formData.totalWeight) || 0,
      pendalWeight: parseFloat(formData.pendalWeight) || 0,
      materialWeight: parseFloat(formData.materialWeight) || 0,
      workId: formData.workId,
      photo: formData.photo,
      remarks: formData.remarks,
      synced: false
    };

    onSave(newEntry);
    
    // Reset form but keep date
    setFormData({
      date: today,
      vendorId: '',
      qty: '',
      totalWeight: '',
      pendalWeight: '',
      materialWeight: '',
      workId: '',
      remarks: '',
      photo: ''
    });
    setSkuInput('');
  };

  const recentEntries = useMemo(() => {
    return state.outwardEntries
      .filter(e => e.date.startsWith(today))
      .sort((a, b) => b.challanNo.localeCompare(a.challanNo));
  }, [state.outwardEntries, today]);

  if (state.vendors.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        <AlertCircle className="mx-auto mb-2 text-orange-500" size={48} />
        <p>Please add Vendors in Masters first.</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 max-w-xl mx-auto">
      <Card>
        <div className="grid grid-cols-2 gap-4">
           <Input 
            label="Date" 
            type="date" 
            value={formData.date} 
            onChange={e => setFormData({...formData, date: e.target.value})} 
          />
           <div className="mb-4">
             <label className="block text-sm font-medium text-slate-700 mb-1">Challan No</label>
             <div className="w-full p-3 bg-slate-100 border border-slate-300 rounded-lg text-slate-500 font-mono">
               {challanPreview}
             </div>
           </div>
        </div>

        <Select 
          label="Vendor" 
          value={formData.vendorId} 
          onChange={e => setFormData({...formData, vendorId: e.target.value})}
        >
          <option value="">Select Vendor</option>
          {state.vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
        </Select>

        <div className="grid grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">SKU Item</label>
            <input 
              list="sku-options" 
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Select or type..."
              value={skuInput}
              onChange={e => setSkuInput(e.target.value)}
            />
            <datalist id="sku-options">
              {state.items.map(i => <option key={i.id} value={i.sku} />)}
            </datalist>
          </div>

           <Input 
            label="Quantity" 
            type="number" 
            inputMode="numeric"
            value={formData.qty} 
            onChange={e => setFormData({...formData, qty: e.target.value})} 
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Input 
            label="Total Wt" 
            type="number" 
            inputMode="decimal"
            className="text-sm"
            value={formData.totalWeight} 
            onChange={e => setFormData({...formData, totalWeight: e.target.value})} 
          />
          <Input 
            label="Pendal Wt" 
            type="number" 
            inputMode="decimal"
             className="text-sm"
            value={formData.pendalWeight} 
            onChange={e => setFormData({...formData, pendalWeight: e.target.value})} 
          />
          <Input 
            label="Mat. Wt" 
            type="number" 
             className="text-sm bg-slate-50"
             readOnly
            value={formData.materialWeight} 
          />
        </div>

        <Select 
          label="Work to be Done" 
          value={formData.workId} 
          onChange={e => setFormData({...formData, workId: e.target.value})}
        >
          <option value="">Select Work</option>
          {state.workTypes.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">Material Photo</label>
          <div className="flex items-center space-x-4">
            <label className="flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg cursor-pointer hover:bg-slate-200 border border-slate-300">
              <Camera size={20} className="mr-2" />
              Capture
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
            </label>
            {formData.photo && <span className="text-green-600 text-sm font-semibold">Image Attached</span>}
          </div>
          {formData.photo && (
            <img src={formData.photo} alt="Preview" className="mt-2 h-20 w-20 object-cover rounded border border-slate-300" />
          )}
        </div>

        <Input 
          label="Remarks" 
          value={formData.remarks} 
          onChange={e => setFormData({...formData, remarks: e.target.value})} 
          placeholder="Any comments..."
        />

        <Button onClick={handleSubmit} className="flex justify-center items-center py-4 text-lg">
          <Plus size={24} className="mr-2" />
          Add Entry
        </Button>

      </Card>

      {/* Recent Entries Section */}
      {recentEntries.length > 0 && (
        <div className="mt-8">
          <h3 className="text-slate-500 font-semibold mb-2 flex items-center">
            <Clock size={16} className="mr-2" /> Recent Entries (Today)
          </h3>
          <div className="space-y-2">
            {recentEntries.map(entry => {
               const item = state.items.find(i => i.id === entry.skuId);
               return (
                 <div key={entry.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex justify-between items-center">
                   <div>
                     <div className="font-bold text-slate-800">{entry.challanNo}</div>
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

export default Outward;