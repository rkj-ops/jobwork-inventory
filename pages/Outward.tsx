import React, { useState, useEffect, useMemo } from 'react';
import { AppState, OutwardEntry, Item } from '../types';
import { Button, Input, Select, Card } from '../components/ui';
import { Camera, Printer, Save, Maximize2, AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import PrintChallan from '../components/PrintChallan';

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
    comboQty: '',
    totalWeight: '',
    pendalWeight: '',
    materialWeight: '',
    workId: '',
    remarks: '',
    photo: '',
    enteredBy: '',
    checkedBy: ''
  });

  const [skuInput, setSkuInput] = useState('');
  const [lastSaved, setLastSaved] = useState<OutwardEntry | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    const mat = (parseFloat(formData.totalWeight) || 0) - (parseFloat(formData.pendalWeight) || 0);
    setFormData(prev => ({
      ...prev,
      materialWeight: mat > 0 ? mat.toFixed(3) : ''
    }));
  }, [formData.totalWeight, formData.pendalWeight]);

  const generateChallanNo = (vendorId: string): string => {
    if (!vendorId) return '---';
    const vendor = state.vendors.find(v => v.id === vendorId);
    if (!vendor) return '---';
    const vendorEntries = state.outwardEntries.filter(e => e.vendorId === vendorId);
    return `${vendor.code}-${(vendorEntries.length + 1).toString().padStart(3, '0')}`;
  };

  const challanPreview = useMemo(() => generateChallanNo(formData.vendorId), [formData.vendorId, state.outwardEntries]);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => setFormData(prev => ({ ...prev, photo: ev.target?.result as string }));
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleSubmit = () => {
    if (!formData.vendorId || !skuInput || !formData.qty) {
      alert("Please fill required fields (Vendor, SKU, Qty)");
      return;
    }

    // DUPLICATE CHECK
    const isDuplicate = state.outwardEntries.some(e => e.challanNo === challanPreview);
    if (isDuplicate) {
        alert(`Error: Challan Number ${challanPreview} already exists! Please check your entries.`);
        return;
    }

    let finalSkuId = '';
    const existingItem = state.items.find(i => i.sku.toLowerCase() === skuInput.toLowerCase());

    if (existingItem) {
      finalSkuId = existingItem.id;
    } else {
      const newItem: Item = { id: uuidv4(), sku: skuInput.toUpperCase(), description: 'Auto', synced: false };
      onAddItem(newItem);
      finalSkuId = newItem.id;
    }

    // Ensure valid date
    const dateToSave = formData.date ? new Date(formData.date).toISOString() : new Date().toISOString();

    const newEntry: OutwardEntry = {
      id: uuidv4(),
      ...formData,
      challanNo: challanPreview,
      skuId: finalSkuId,
      qty: parseFloat(formData.qty),
      comboQty: parseFloat(formData.comboQty) || 0,
      totalWeight: parseFloat(formData.totalWeight) || 0,
      pendalWeight: parseFloat(formData.pendalWeight) || 0,
      materialWeight: parseFloat(formData.materialWeight) || 0,
      date: dateToSave,
      status: 'OPEN',
      synced: false
    };

    onSave(newEntry);
    setLastSaved(newEntry);
    
    setFormData({
      date: today, vendorId: '', qty: '', comboQty: '', totalWeight: '', pendalWeight: '', materialWeight: '',
      workId: '', remarks: '', photo: '', enteredBy: '', checkedBy: ''
    });
    setSkuInput('');
  };

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => { window.print(); }, 100);
  };

  if (isPrinting && lastSaved) return <PrintChallan entry={lastSaved} state={state} onClose={() => setIsPrinting(false)} />;

  if (state.vendors.length === 0) return <div className="p-8 text-center text-slate-500"><AlertCircle className="mx-auto mb-2 text-orange-500" size={48} /><p>Please add Vendors in Masters first.</p></div>;

  return (
    <div className="p-4 pb-24 max-w-xl mx-auto">
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
           <img src={previewImage} className="max-w-full max-h-full rounded" />
        </div>
      )}

      {lastSaved && (
        <div className="mb-4 bg-green-50 p-4 rounded-xl border border-green-200 flex justify-between items-center">
          <span className="text-green-700 font-bold">Challan {lastSaved.challanNo} Saved!</span>
          <button onClick={handlePrint} className="flex items-center bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold"><Printer size={16} className="mr-2"/> Print</button>
        </div>
      )}

      <Card>
        <div className="grid grid-cols-2 gap-4">
           <Input label="Date" type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
           <div className="mb-4">
             <label className="block text-sm font-medium text-slate-700 mb-1">Challan No</label>
             <div className="w-full p-3 bg-slate-100 border border-slate-300 rounded-lg text-slate-500 font-mono">{challanPreview}</div>
           </div>
        </div>

        <Select label="Vendor" value={formData.vendorId} onChange={e => setFormData({...formData, vendorId: e.target.value})}>
          <option value="">Select Vendor</option>
          {state.vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
        </Select>

        <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">SKU Item</label>
            <input list="sku-options" className="w-full p-3 border border-slate-300 rounded-lg" value={skuInput} onChange={e => setSkuInput(e.target.value)} placeholder="SKU Code" />
            <datalist id="sku-options">{state.items.map(i => <option key={i.id} value={i.sku} />)}</datalist>
        </div>

        <div className="grid grid-cols-2 gap-4">
           <Input label="Qty" type="number" inputMode="numeric" value={formData.qty} onChange={e => setFormData({...formData, qty: e.target.value})} />
           <Input label="Combo Qty (Opt)" type="number" inputMode="numeric" value={formData.comboQty} onChange={e => setFormData({...formData, comboQty: e.target.value})} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Input label="Total Wt" type="number" inputMode="decimal" className="text-sm" value={formData.totalWeight} onChange={e => setFormData({...formData, totalWeight: e.target.value})} />
          <Input label="Pendal Wt" type="number" inputMode="decimal" className="text-sm" value={formData.pendalWeight} onChange={e => setFormData({...formData, pendalWeight: e.target.value})} />
          <Input label="Mat. Wt" type="number" className="text-sm bg-slate-50" readOnly value={formData.materialWeight} />
        </div>

        <Select label="Work to be Done" value={formData.workId} onChange={e => setFormData({...formData, workId: e.target.value})}>
          <option value="">Select Work</option>
          {state.workTypes.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>

        <div className="grid grid-cols-2 gap-4">
           <Select label="Entered By" value={formData.enteredBy} onChange={e => setFormData({...formData, enteredBy: e.target.value})}>
              <option value="">Select User</option>
              {state.users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
           </Select>
           <Select label="Checked By" value={formData.checkedBy} onChange={e => setFormData({...formData, checkedBy: e.target.value})}>
              <option value="">Select User</option>
              {state.users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
           </Select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">Photo</label>
          <div className="flex gap-4 items-center">
              <label className="flex-1 flex items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer hover:bg-slate-50">
                 <Camera className="mr-2 text-slate-400"/> {formData.photo ? 'Retake' : 'Capture'}
                 <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
              </label>
              {formData.photo && (
                  <div className="relative group cursor-pointer" onClick={() => setPreviewImage(formData.photo)}>
                    <img src={formData.photo} className="h-16 w-16 rounded-lg border object-cover" />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center rounded-lg"><Maximize2 className="text-white opacity-0 group-hover:opacity-100" size={16}/></div>
                  </div>
              )}
          </div>
        </div>

        <Input label="Remarks" value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})} />
        <Button onClick={handleSubmit}><Save className="mr-2" size={18} /> Save Entry</Button>
      </Card>
    </div>
  );
};

export default Outward;