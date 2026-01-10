import React, { useState, useEffect } from 'react';
import { AppState, InwardEntry } from '../types';
import { Button, Input, Select, Card } from '../components/ui';
import { Download, Camera, Maximize2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface InwardProps {
  state: AppState;
  onSave: (entry: InwardEntry) => void;
  updateState?: (k: keyof AppState, v: any) => void;
}

const Inward: React.FC<InwardProps> = ({ state, onSave }) => {
  const today = new Date().toISOString().split('T')[0];
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectedOutwardId, setSelectedOutwardId] = useState('');
  const selectedOutward = state.outwardEntries.find(e => e.id === selectedOutwardId);

  const [formData, setFormData] = useState({
    date: today, qty: '', comboQty: '', totalWeight: '', pendalWeight: '', materialWeight: '', remarks: '',
    enteredBy: '', checkedBy: '', photo: ''
  });

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedOutward) {
      setFormData({
        date: today, qty: '', comboQty: '',
        totalWeight: '', pendalWeight: '',
        materialWeight: '', remarks: '', enteredBy: '', checkedBy: '', photo: ''
      });
    }
  }, [selectedOutward]);

  useEffect(() => {
    const mat = (parseFloat(formData.totalWeight) || 0) - (parseFloat(formData.pendalWeight) || 0);
    setFormData(prev => ({ ...prev, materialWeight: mat > 0 ? mat.toFixed(3) : '' }));
  }, [formData.totalWeight, formData.pendalWeight]);

  const pendingOutwards = state.outwardEntries.filter(e => {
    if (e.vendorId !== selectedVendorId) return false;
    if (e.status === 'COMPLETED') return false; 
    const returnedQty = state.inwardEntries.filter(i => i.outwardChallanId === e.id).reduce((sum, i) => sum + i.qty, 0);
    return returnedQty < e.qty;
  });

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => setFormData(prev => ({ ...prev, photo: ev.target?.result as string }));
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleSubmit = () => {
    const qtyVal = parseFloat(formData.qty);
    const comboVal = parseFloat(formData.comboQty) || 0;

    if (!selectedOutwardId || !formData.qty) return alert("Select Challan & Qty");

    // VALIDATION: Combo Qty <= Recv Qty
    if (comboVal > qtyVal) {
        alert(`Error: Combo Qty (${comboVal}) cannot be greater than Received Qty (${qtyVal})!`);
        return;
    }
    
    if (selectedOutward) {
        const previousInwards = state.inwardEntries.filter(i => i.outwardChallanId === selectedOutwardId);
        const totalInwardQty = previousInwards.reduce((acc, curr) => acc + curr.qty, 0) + qtyVal;
        
        // VALIDATION: Total Inward <= Outward Qty Sent
        if (totalInwardQty > selectedOutward.qty) {
            alert(`Error: Total Inward Qty (${totalInwardQty}) exceeds Outward Qty (${selectedOutward.qty})!`);
            return;
        }
    }

    const dateToSave = formData.date ? new Date(formData.date).toISOString() : new Date().toISOString();

    onSave({
      id: uuidv4(),
      outwardChallanId: selectedOutwardId,
      vendorId: selectedVendorId,
      skuId: selectedOutward?.skuId || '',
      ...formData,
      qty: qtyVal,
      comboQty: comboVal,
      totalWeight: parseFloat(formData.totalWeight) || 0,
      pendalWeight: parseFloat(formData.pendalWeight) || 0,
      materialWeight: parseFloat(formData.materialWeight) || 0,
      date: dateToSave,
      synced: false
    });

    setFormData({ date: today, qty: '', comboQty: '', totalWeight: '', pendalWeight: '', materialWeight: '', remarks: '', enteredBy: '', checkedBy: '', photo: '' });
    setSelectedOutwardId('');
  };

  return (
    <div className="p-4 pb-24 max-w-xl mx-auto">
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
           <img src={previewImage} className="max-w-full max-h-full rounded" />
        </div>
      )}

      <Card title="Source">
        <Select label="Vendor" value={selectedVendorId} onChange={e => { setSelectedVendorId(e.target.value); setSelectedOutwardId(''); }}>
          <option value="">Select Vendor</option>
          {state.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>

        {selectedVendorId && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1 font-bold">Pending Challans</label>
            {pendingOutwards.length === 0 ? <div className="text-slate-500 text-sm p-2 border rounded bg-slate-50">No pending items.</div> : 
              <div className="grid gap-2 max-h-48 overflow-y-auto pr-1">
                {pendingOutwards.map(out => {
                   const item = state.items.find(i => i.id === out.skuId);
                   return <div key={out.id} onClick={() => setSelectedOutwardId(out.id)} className={`p-3 border rounded-xl cursor-pointer transition-all ${selectedOutwardId === out.id ? 'border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-500' : 'bg-white hover:bg-slate-50 border-slate-200 shadow-sm'}`}>
                        <div className="flex justify-between font-bold text-sm"><span>#{out.challanNo}</span><span className="text-slate-400 font-mono text-[10px] uppercase tracking-tighter">{new Date(out.date).toLocaleDateString()}</span></div>
                        <div className="text-xs text-slate-600 mt-1 font-black uppercase tracking-tight">{item?.sku} - <span className="text-blue-600">Qty: {out.qty}</span></div>
                     </div>;
                })}
              </div>}
          </div>
        )}
      </Card>

      {selectedOutward && (
        <Card title={`Receiving for #${selectedOutward.challanNo}`} className="border-t-4 border-t-green-500">
           <Input label="Recv Date" type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
           <div className="grid grid-cols-2 gap-4">
             <Input label="Recv Qty" type="number" inputMode="numeric" value={formData.qty} onChange={e => setFormData({...formData, qty: e.target.value})} />
             <Input label="Combo Qty" type="number" inputMode="numeric" value={formData.comboQty} onChange={e => setFormData({...formData, comboQty: e.target.value})} />
           </div>
           <div className="grid grid-cols-3 gap-2">
            <Input label="Total Wt" type="number" inputMode="decimal" value={formData.totalWeight} onChange={e => setFormData({...formData, totalWeight: e.target.value})} />
            <Input label="Pendal Wt" type="number" inputMode="decimal" value={formData.pendalWeight} onChange={e => setFormData({...formData, pendalWeight: e.target.value})} />
             <Input label="Mat. Wt" type="number" className="bg-slate-50" readOnly value={formData.materialWeight} />
           </div>
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
              <label className="block text-sm font-medium text-slate-700 mb-1 font-bold">Inward Photo</label>
              <div className="flex gap-4 items-center">
                  <label className="flex-1 flex items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 border-slate-300">
                     <Camera className="mr-2 text-slate-400"/> {formData.photo ? 'Retake' : 'Capture'}
                     <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
                  </label>
                  {formData.photo && (
                      <div className="relative group cursor-pointer" onClick={() => setPreviewImage(formData.photo)}>
                        <img src={formData.photo} className="h-16 w-16 rounded-lg border border-slate-300 object-cover" />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center rounded-lg"><Maximize2 className="text-white opacity-0 group-hover:opacity-100" size={16}/></div>
                      </div>
                  )}
              </div>
            </div>

           <Input label="Remarks" value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})} />
           <Button onClick={handleSubmit}><Download size={20} className="mr-2" /> Save Inward</Button>
        </Card>
      )}
    </div>
  );
};

export default Inward;