import React, { useState, useEffect, useMemo } from 'react';
import { AppState, OutwardEntry, Item } from '../types';
import { Button, Input, Select, Card } from '../components/ui';
import { Camera, Printer, Save, Maximize2, AlertCircle, X, ScanBarcode } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import PrintChallan from '../components/PrintChallan';
import JsBarcode from 'jsbarcode';

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
  const [showLabel, setShowLabel] = useState<OutwardEntry | null>(null);
  const [barcodeData, setBarcodeData] = useState<string>('');

  useEffect(() => {
    const mat = (parseFloat(formData.totalWeight) || 0) - (parseFloat(formData.pendalWeight) || 0);
    setFormData(prev => ({
      ...prev,
      materialWeight: mat > 0 ? mat.toFixed(3) : ''
    }));
  }, [formData.totalWeight, formData.pendalWeight]);

  useEffect(() => {
    if (showLabel) {
       const item = state.items.find(i => i.id === showLabel.skuId);
       if (item && item.sku) {
           try {
             const canvas = document.createElement('canvas');
             JsBarcode(canvas, item.sku, {
                format: "CODE128",
                displayValue: false,
                margin: 0,
                height: 50,
                width: 2
             });
             setBarcodeData(canvas.toDataURL("image/png"));
           } catch (e) {
             console.error("Barcode generation failed", e);
           }
       }
    }
  }, [showLabel, state.items]);

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
    setShowLabel(newEntry);
    
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

  const handlePrintLabel = () => {
    const win = window.open('', '', 'width=400,height=300');
    if (win) {
        const item = state.items.find(i => i.id === showLabel?.skuId);
        win.document.write(`
            <html>
            <head><style>
                @page { size: 50mm 25mm; margin: 0; }
                body { margin: 0; padding: 0; width: 50mm; height: 25mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; font-family: sans-serif; overflow: hidden; }
                .top { height: 10mm; width: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding-top: 1mm;}
                .bottom { height: 14mm; width: 100%; display: flex; justify-content: center; align-items: flex-start; }
                .heading { font-family: 'Arial Black', Arial, sans-serif; font-weight: 900; font-size: 8pt; text-transform: uppercase; line-height: 1; }
                .sku { font-weight: bold; font-size: 11pt; text-align: center; margin-top: 1px; }
                .barcode-img { height: 12mm; max-width: 48mm; }
            </style></head>
            <body>
                <div class="top">
                    <div class="heading">SKU Code</div>
                    <div class="sku">${item?.sku || ''}</div>
                </div>
                <div class="bottom">
                    <img src="${barcodeData}" class="barcode-img" />
                </div>
                <script>window.print(); window.close();</script>
            </body>
            </html>
        `);
        win.document.close();
    }
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

      {showLabel && (
         <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
                <h3 className="text-lg font-bold mb-4">Generate SKU Label</h3>
                <div className="border border-slate-300 w-[50mm] h-[25mm] mx-auto bg-white mb-6 relative shadow-md flex flex-col items-center">
                   <div className="h-[10mm] w-full flex flex-col justify-end items-center pt-1">
                       <div className="font-black text-[10px] uppercase font-sans leading-none">SKU Code</div>
                       <div className="font-bold text-lg leading-none">{state.items.find(i=>i.id===showLabel.skuId)?.sku}</div>
                   </div>
                   <div className="h-[15mm] w-full flex justify-center items-start pt-1">
                       {barcodeData && <img src={barcodeData} className="h-[12mm] max-w-[48mm]" />}
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <Button onClick={handlePrintLabel} variant="primary"><Printer className="mr-2" size={16}/> Print Label</Button>
                    <Button onClick={() => setShowLabel(null)} variant="secondary"><X className="mr-2" size={16}/> Close</Button>
                </div>
            </div>
         </div>
      )}

      {lastSaved && !showLabel && (
        <div className="mb-4 bg-green-50 p-4 rounded-xl border border-green-200 flex justify-between items-center">
          <span className="text-green-700 font-bold">Challan {lastSaved.challanNo} Saved!</span>
          <div>
            <button onClick={() => setShowLabel(lastSaved)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold mr-2"><ScanBarcode size={16} /></button>
            <button onClick={handlePrint} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold"><Printer size={16} /></button>
          </div>
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