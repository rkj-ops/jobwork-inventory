import React, { useState, useEffect } from 'react';
import { AppState, InwardEntry } from '../types';
import { Button, Input, Select, Card, SearchableList } from '../components/ui';
import { Download, Camera, Maximize2, Upload, RefreshCw } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { compressImage } from '../services/sheets';

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

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  useEffect(() => {
    if (selectedOutward) {
      setFormData({
        date: today, qty: '', comboQty: '',
        totalWeight: '', pendalWeight: '',
        materialWeight: '', remarks: '', enteredBy: '', checkedBy: '', photo: ''
      });
      setPreviewUrl(null);
    }
  }, [selectedOutward]);

  useEffect(() => {
    return () => { if(previewUrl) URL.revokeObjectURL(previewUrl); }
  }, [previewUrl]);

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
      const file = e.target.files[0];
      setPreviewUrl(URL.createObjectURL(file));

      setIsProcessingImage(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const rawBase64 = ev.target?.result as string;
        try {
          const compressed = await compressImage(rawBase64, 800, 0.7);
          setFormData(prev => ({ ...prev, photo: compressed }));
        } catch (err) {
          setFormData(prev => ({ ...prev, photo: rawBase64 }));
        } finally {
          setIsProcessingImage(false);
        }
      };
      reader.onerror = () => setIsProcessingImage(false);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = () => {
    const qtyVal = parseFloat(formData.qty);
    const comboVal = parseFloat(formData.comboQty) || 0;

    if (!selectedOutwardId || !formData.qty) return alert("Select Challan & Qty");

    if (comboVal > qtyVal) {
        alert(`Error: Combo Qty (${comboVal}) cannot be greater than Received Qty (${qtyVal})!`);
        return;
    }
    
    if (selectedOutward) {
        const previousInwards = state.inwardEntries.filter(i => i.outwardChallanId === selectedOutwardId);
        const totalInwardQty = previousInwards.reduce((acc, curr) => acc + curr.qty, 0) + qtyVal;
        
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
    setPreviewUrl(null);
  };

  const vendorOptions = state.vendors.map(v => ({ id: v.id, label: v.name, sublabel: v.code }));

  return (
    <div className="p-4 pb-24 max-w-xl mx-auto">
      <Card title="Source">
        <SearchableList 
           label="Vendor" 
           items={vendorOptions} 
           value={selectedVendorId} 
           onSelect={id => { setSelectedVendorId(id); setSelectedOutwardId(''); }}
           placeholder="Search Vendor Name or Code..."
        />

        {selectedVendorId && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1 font-bold">Pending Challans</label>
            {pendingOutwards.length === 0 ? <div className="text-slate-500 text-sm p-2 border rounded bg-slate-50 italic">No pending items.</div> : 
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
        <Card title={`Receiving for #${selectedOutward.challanNo}`} className="border-t-4 border-t-green-500 animate-in fade-in slide-in-from-bottom duration-300">
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
              <label className="block text-sm font-medium text-slate-700 mb-1 font-bold">Inward Photo Attachment</label>
              <div className="flex gap-4 items-center">
                  <label className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 border-slate-300 transition-colors bg-slate-50">
                     <div className="flex gap-2 mb-1">
                        {isProcessingImage ? <RefreshCw className="text-blue-500 animate-spin" size={20}/> : (
                           <>
                             <Camera className="text-slate-400" size={20}/>
                             <Upload className="text-slate-400" size={20}/>
                           </>
                        )}
                     </div>
                     <span className="text-xs font-bold text-slate-500 uppercase">
                        {isProcessingImage ? 'Processing...' : (previewUrl ? 'Change Photo' : 'Capture / Gallery')}
                     </span>
                     <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                  </label>
                  {previewUrl && (
                      <div className="relative group cursor-pointer" onClick={() => {}}>
                        <img src={previewUrl} className="h-20 w-20 rounded-lg border border-slate-200 object-cover shadow-sm bg-white" />
                      </div>
                  )}
              </div>
            </div>

           <Input label="Remarks" value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})} />
           <Button onClick={handleSubmit} disabled={isProcessingImage}>
             {isProcessingImage ? 'Processing Image...' : <><Download size={20} className="mr-2" /> Save Inward</>}
           </Button>
        </Card>
      )}
    </div>
  );
};

export default Inward;