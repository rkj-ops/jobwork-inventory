import React, { useState, useEffect, useMemo } from 'react';
import { AppState, OutwardEntry, Item } from '../types';
import { Button, Input, Select, Card, SearchableList } from '../components/ui';
import { Camera, Printer, Save, Maximize2, AlertCircle, Upload, RefreshCw } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import PrintChallan from '../components/PrintChallan';
import { compressImage } from '../services/sheets';

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
    photo: '', // Base64 for upload
    enteredBy: '',
    checkedBy: ''
  });

  const [skuId, setSkuId] = useState('');
  const [lastSaved, setLastSaved] = useState<OutwardEntry | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // Object URL for immediate preview
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // Cleanup object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
        if (previewUrl && !previewUrl.startsWith('data:')) {
            URL.revokeObjectURL(previewUrl);
        }
    };
  }, [previewUrl]);

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

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // 1. Immediate Preview using Object URL (Fast & Low Memory)
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      
      // 2. Background Compression
      setIsProcessingImage(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const rawBase64 = ev.target?.result as string;
        try {
          // Force compression to reduce memory footprint for upload
          const compressed = await compressImage(rawBase64, 800, 0.7);
          setFormData(prev => ({ ...prev, photo: compressed }));
        } catch (err) {
          console.error("Compression failed", err);
          // Fallback to raw if compression fails, but warn user
          setFormData(prev => ({ ...prev, photo: rawBase64 })); 
        } finally {
          setIsProcessingImage(false);
        }
      };
      reader.onerror = () => setIsProcessingImage(false);
      reader.readAsDataURL(file);
    }
  };

  const handleAddNewSku = (skuName: string) => {
    if (!skuName.trim()) return;
    const newItem: Item = { id: uuidv4(), sku: skuName.trim().toUpperCase(), description: 'Auto', synced: false };
    onAddItem(newItem);
    setSkuId(newItem.id);
  };

  const handleSubmit = () => {
    if (!formData.vendorId || !skuId || !formData.qty) {
      alert("Please fill required fields (Vendor, SKU, Qty)");
      return;
    }

    const isDuplicate = state.outwardEntries.some(e => e.challanNo === challanPreview);
    if (isDuplicate) {
        alert(`Error: Challan Number ${challanPreview} already exists! Please check your entries.`);
        return;
    }

    const dateToSave = formData.date ? new Date(formData.date).toISOString() : new Date().toISOString();

    const newEntry: OutwardEntry = {
      id: uuidv4(),
      ...formData,
      challanNo: challanPreview,
      skuId: skuId,
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
    
    // Reset Form
    setFormData({
      date: today, vendorId: '', qty: '', comboQty: '', totalWeight: '', pendalWeight: '', materialWeight: '',
      workId: '', remarks: '', photo: '', enteredBy: '', checkedBy: ''
    });
    setSkuId('');
    setPreviewUrl(null);
  };

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => { window.print(); }, 100);
  };

  const vendorOptions = state.vendors.map(v => ({ id: v.id, label: v.name, sublabel: v.code }));
  const skuOptions = state.items.map(i => ({ id: i.id, label: i.sku, sublabel: i.description }));

  if (isPrinting && lastSaved) return <PrintChallan entry={lastSaved} state={state} onClose={() => setIsPrinting(false)} />;

  if (state.vendors.length === 0) return <div className="p-8 text-center text-slate-500"><AlertCircle className="mx-auto mb-2 text-orange-500" size={48} /><p>Please add Vendors in Masters first.</p></div>;

  return (
    <div className="p-4 pb-24 max-w-xl mx-auto">
      {lastSaved && (
        <div className="mb-4 bg-green-50 p-4 rounded-xl border border-green-200 flex justify-between items-center animate-in fade-in slide-in-from-top duration-300">
          <span className="text-green-700 font-bold">Challan {lastSaved.challanNo} Saved!</span>
          <div>
            <button onClick={handlePrint} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold active:scale-95 transition-transform"><Printer size={16} /></button>
          </div>
        </div>
      )}

      <Card>
        <div className="grid grid-cols-2 gap-4">
           <Input label="Date" type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
           <div className="mb-4">
             <label className="block text-sm font-medium text-slate-700 mb-1">Challan No</label>
             <div className="w-full p-3.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-mono font-bold">{challanPreview}</div>
           </div>
        </div>

        <SearchableList 
           label="Vendor" 
           items={vendorOptions} 
           value={formData.vendorId} 
           onSelect={id => setFormData({...formData, vendorId: id})}
           placeholder="Search Vendor Name or Code..."
        />

        <SearchableList 
           label="SKU Item" 
           items={skuOptions} 
           value={skuId} 
           onSelect={id => setSkuId(id)}
           onAddNew={handleAddNewSku}
           placeholder="Search or add new SKU..."
        />

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
          <label className="block text-sm font-medium text-slate-700 mb-1 font-bold">Photo Attachment</label>
          <div className="flex gap-4 items-center">
              <label className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 border-slate-300 transition-colors bg-slate-50 active:bg-slate-100">
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
           {isProcessingImage ? 'Processing Image...' : <><Save className="mr-2" size={18} /> Save Entry</>}
        </Button>
      </Card>
    </div>
  );
};

export default Outward;