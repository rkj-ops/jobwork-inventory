import React, { useState, useMemo, useEffect } from 'react';
import { AppState, InwardEntry } from '../types';
import { Button, Input, Select, Card } from '../components/ui';
import { Download, AlertCircle, Camera } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface InwardProps {
  state: AppState;
  onSave: (entry: InwardEntry) => void;
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

  useEffect(() => {
    if (selectedOutward) {
      setFormData({
        date: today, qty: selectedOutward.qty.toString(), comboQty: selectedOutward.comboQty?.toString() || '',
        totalWeight: selectedOutward.totalWeight.toString(), pendalWeight: selectedOutward.pendalWeight.toString(),
        materialWeight: selectedOutward.materialWeight.toString(), remarks: '', enteredBy: '', checkedBy: '', photo: ''
      });
    }
  }, [selectedOutward]);

  useEffect(() => {
    const mat = (parseFloat(formData.totalWeight) || 0) - (parseFloat(formData.pendalWeight) || 0);
    setFormData(prev => ({ ...prev, materialWeight: mat > 0 ? mat.toFixed(3) : '' }));
  }, [formData.totalWeight, formData.pendalWeight]);

  const pendingOutwards = state.outwardEntries.filter(e => {
    if (e.vendorId !== selectedVendorId) return false;
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
    if (!selectedOutwardId || !formData.qty) return alert("Select Challan & Qty");
    
    onSave({
      id: uuidv4(),
      outwardChallanId: selectedOutwardId,
      vendorId: selectedVendorId,
      skuId: selectedOutward?.skuId || '',
      ...formData,
      qty: parseFloat(formData.qty),
      comboQty: parseFloat(formData.comboQty) || 0,
      totalWeight: parseFloat(formData.totalWeight) || 0,
      pendalWeight: parseFloat(formData.pendalWeight) || 0,
      materialWeight: parseFloat(formData.materialWeight) || 0,
      date: new Date(formData.date).toISOString(),
      synced: false
    });

    setFormData({ date: today, qty: '', comboQty: '', totalWeight: '', pendalWeight: '', materialWeight: '', remarks: '', enteredBy: '', checkedBy: '', photo: '' });
    setSelectedOutwardId('');
  };

  return (
    <div className="p-4 pb-24 max-w-xl mx-auto">
      <Card title="Source">
        <Select label="Vendor" value={selectedVendorId} onChange={e => { setSelectedVendorId(e.target.value); setSelectedOutwardId(''); }}>
          <option value="">Select Vendor</option>
          {state.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>

        {selectedVendorId && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Pending Challans</label>
            {pendingOutwards.length === 0 ? <div className="text-slate-500 text-sm p-2 border rounded bg-slate-50">No pending items.</div> : 
              <div className="grid gap-2 max-h-40 overflow-y-auto">
                {pendingOutwards.map(out => {
                   const item = state.items.find(i => i.id === out.skuId);
                   return <div key={out.id} onClick={() => setSelectedOutwardId(out.id)} className={`p-3 border rounded-lg cursor-pointer ${selectedOutwardId === out.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-slate-50'}`}>
                        <div className="flex justify-between font-bold text-sm"><span>#{out.challanNo}</span><span>{new Date(out.date).toLocaleDateString()}</span></div>
                        <div className="text-xs text-slate-600">{item?.sku} - Qty: {out.qty}</div>
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
             <Input label="Recv Qty" type="number" value={formData.qty} onChange={e => setFormData({...formData, qty: e.target.value})} />
             <Input label="Combo Qty" type="number" value={formData.comboQty} onChange={e => setFormData({...formData, comboQty: e.target.value})} />
           </div>
           <div className="grid grid-cols-3 gap-2">
            <Input label="Total Wt" type="number" value={formData.totalWeight} onChange={e => setFormData({...formData, totalWeight: e.target.value})} />
            <Input label="Pendal Wt" type="number" value={formData.pendalWeight} onChange={e => setFormData({...formData, pendalWeight: e.target.value})} />
             <Input label="Mat. Wt" type="number" className="bg-slate-50" readOnly value={formData.materialWeight} />
           </div>
           <div className="grid grid-cols-2 gap-4">
              <Input label="Entered By" value={formData.enteredBy} onChange={e => setFormData({...formData, enteredBy: e.target.value})} />
              <Input label="Checked By" value={formData.checkedBy} onChange={e => setFormData({...formData, checkedBy: e.target.value})} />
           </div>
           <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Inward Photo</label>
              <label className="flex items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer hover:bg-slate-50">
                 <Camera className="mr-2 text-slate-400"/> {formData.photo ? 'Retake' : 'Capture'}
                 <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
              </label>
              {formData.photo && <img src={formData.photo} className="mt-2 h-24 rounded-lg border object-cover" />}
            </div>
           <Input label="Remarks" value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})} />
           <Button onClick={handleSubmit}><Download size={20} className="mr-2" /> Save Inward</Button>
        </Card>
      )}
    </div>
  );
};

export default Inward;