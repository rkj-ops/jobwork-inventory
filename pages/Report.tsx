import React, { useMemo, useState, useRef } from 'react';
import { AppState, OutwardEntry, InwardEntry, formatDisplayDate } from '../types';
import { Card, Button } from '../components/ui';
import { syncDataToSheets, initGapi } from '../services/sheets';
import { ChevronDown, ChevronUp, Trash2, Printer, CheckCircle, Search, Info, Calendar, ScanBarcode } from 'lucide-react';
import PrintChallan from '../components/PrintChallan';
import JsBarcode from 'jsbarcode';

interface ReportRow extends OutwardEntry {
  vendorName: string;
  vendorCode: string;
  itemSku: string;
  itemDesc: string;
  workName: string;
  inQty: number;
  inComboQty: number;
  shortQty: number;
  shortComboQty: number;
  pending: number;
  lastRecvDate: string | null;
  recvDates: string[]; 
  inwards: InwardEntry[];
}

interface ReportProps {
  state: AppState;
  markSynced: (newState: AppState) => void;
  updateState?: (k: keyof AppState, v: any) => void;
  onManualSync?: () => void;
}

const Report: React.FC<ReportProps> = ({ state, markSynced, updateState, onManualSync }) => {
  const [printEntry, setPrintEntry] = useState<OutwardEntry | null>(null);
  const [detailView, setDetailView] = useState<ReportRow | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'qty' | 'overdue'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [hideCompleted, setHideCompleted] = useState(false);

  const markJobComplete = (outwardId: string) => {
    if(!updateState) return;
    if(confirm("Are you sure you want to mark this job as COMPLETE? (Short Close)")) {
        const updatedOutwards = state.outwardEntries.map(e => 
            e.id === outwardId ? { ...e, status: 'COMPLETED' as const, synced: false } : e
        );
        updateState('outwardEntries', updatedOutwards);
        if(detailView) setDetailView(null);
    }
  };

  const printLabel = (sku: string) => {
    if (!sku) return;
    const canvas = document.createElement('canvas');
    try {
        // Generate high-density barcode but with strict display height
        JsBarcode(canvas, sku, {
            format: "CODE128",
            displayValue: false,
            margin: 0,
            height: 40,
            width: 2
        });
        const barcodeData = canvas.toDataURL("image/png");
        const win = window.open('', '', 'width=400,height=300');
        if (win) {
            win.document.write(`
                <html>
                <head><style>
                    @page { size: 50mm 25mm; margin: 0; }
                    * { box-sizing: border-box; }
                    body { 
                        margin: 0; 
                        padding: 0; 
                        width: 50mm; 
                        height: 25mm; 
                        display: flex; 
                        flex-direction: column; 
                        align-items: center; 
                        justify-content: flex-start; 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        overflow: hidden; 
                        background: white; 
                    }
                    .section {
                        width: 50mm;
                        height: 12.5mm;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        overflow: hidden;
                        padding: 0.5mm 2mm;
                    }
                    .sku-container {
                        text-align: center;
                        font-weight: 800;
                        color: black;
                        line-height: 1.05;
                        width: 100%;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        /* Font-size auto-shrinking logic using clamp */
                        font-size: clamp(8pt, 3vw, 11pt);
                        word-break: break-all;
                    }
                    .barcode-container {
                        padding-bottom: 1mm;
                    }
                    .barcode-img { 
                        height: 10.5mm; 
                        width: 46mm; 
                        object-fit: contain; 
                    }
                </style></head>
                <body>
                    <div class="section">
                        <div class="sku-container">${sku}</div>
                    </div>
                    <div class="section barcode-container">
                        <img src="${barcodeData}" class="barcode-img" />
                    </div>
                    <script>
                        window.onload = function() {
                            window.print();
                            window.close();
                        };
                    </script>
                </body>
                </html>
            `);
            win.document.close();
        }
    } catch (e) {
        console.error("Barcode generation failed", e);
    }
  };

  const reportData = useMemo(() => {
    let rows: ReportRow[] = state.outwardEntries.map(o => {
        const inwards = state.inwardEntries.filter(i => i.outwardChallanId === o.id);
        const inQty = inwards.reduce((sum, i) => sum + i.qty, 0);
        const inComboQty = inwards.reduce((sum, i) => sum + (i.comboQty || 0), 0);
        
        const recvDates = Array.from(new Set<string>(inwards.map(i => i.date.split('T')[0]))).sort();
        const lastRecvDate = recvDates.length > 0 ? recvDates[recvDates.length - 1] : null;

        const vendor = state.vendors.find(v => v.id === o.vendorId);
        const item = state.items.find(i => i.id === o.skuId);
        const work = state.workTypes.find(w => w.id === o.workId);
        
        const isClosed = o.status === 'COMPLETED';
        const pending = isClosed ? 0 : Math.max(0, o.qty - inQty);
        
        const shortQty = isClosed ? Math.max(0, o.qty - inQty) : 0;
        const shortComboQty = isClosed ? Math.max(0, (o.comboQty ?? 0) - inComboQty) : 0;

        return {
            ...o,
            vendorName: vendor?.name || 'Unknown',
            vendorCode: vendor?.code || 'UNK',
            itemSku: item?.sku || 'UNK',
            itemDesc: item?.description || '',
            workName: work?.name || '',
            inQty,
            inComboQty,
            shortQty,
            shortComboQty,
            pending,
            lastRecvDate,
            recvDates,
            inwards
        };
    });

    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        rows = rows.filter(r => 
            r.vendorName.toLowerCase().includes(lower) || 
            r.vendorCode.toLowerCase().includes(lower) || 
            r.challanNo.toLowerCase().includes(lower) ||
            r.itemSku.toLowerCase().includes(lower) ||
            r.itemDesc.toLowerCase().includes(lower)
        );
    }
    if (dateFrom) rows = rows.filter(r => r.date >= dateFrom);
    if (dateTo) rows = rows.filter(r => r.date <= dateTo);
    if (hideCompleted) rows = rows.filter(r => r.pending > 0 && r.status !== 'COMPLETED');

    rows.sort((a, b) => {
        let diff = 0;
        if (sortBy === 'date') diff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (sortBy === 'qty') diff = a.qty - b.qty;
        if (sortBy === 'overdue') {
            const now = new Date().getTime();
            diff = (now - new Date(a.date).getTime()) - (now - new Date(b.date).getTime());
        }
        return sortOrder === 'asc' ? diff : -diff;
    });
    return rows;
  }, [state, searchTerm, dateFrom, dateTo, sortBy, sortOrder, hideCompleted]);

  if (printEntry) return <PrintChallan entry={printEntry} state={state} onClose={() => setPrintEntry(null)} />;

  return (
    <div className="p-4 pb-24 max-w-4xl mx-auto">
      {detailView && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-lg">Details: #{detailView.challanNo}</h3>
                    <button onClick={() => setDetailView(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><Trash2 className="rotate-45" size={20}/></button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                    <div className="mb-4 bg-blue-50 p-4 rounded-xl text-sm border border-blue-100 shadow-inner">
                        <div className="grid grid-cols-2 gap-y-2">
                          <p><strong>Vendor:</strong> {detailView.vendorName}</p>
                          <p><strong>Work:</strong> {detailView.workName}</p>
                          <p><strong>Sent Date:</strong> {formatDisplayDate(detailView.date)}</p>
                          <p><strong>Status:</strong> <span className={`font-bold ${detailView.status === 'COMPLETED' ? 'text-green-600' : 'text-orange-600'}`}>{detailView.status || 'OPEN'}</span></p>
                          <p><strong>Item:</strong> {detailView.itemSku}</p>
                          {detailView.itemDesc && <p className="col-span-2 text-xs italic text-slate-500">{detailView.itemDesc}</p>}
                          <p><strong>Sent Qty:</strong> {detailView.qty} (Combo: {detailView.comboQty ?? 0})</p>
                          <p><strong>Recv Qty:</strong> {detailView.inQty} (Combo: {detailView.inComboQty})</p>
                          <p><strong>Out. By:</strong> {detailView.enteredBy || 'Admin'}</p>
                          <p><strong>Out. Chk By:</strong> {detailView.checkedBy || '---'}</p>
                        </div>
                        {detailView.recvDates.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-blue-200">
                             <p><strong>Received Dates:</strong> {detailView.recvDates.map(d => formatDisplayDate(d)).join(', ')}</p>
                          </div>
                        )}
                        {detailView.status === 'COMPLETED' && (detailView.shortQty > 0 || detailView.shortComboQty > 0) && (
                          <div className="mt-2 pt-2 border-t border-blue-200 text-red-600 font-bold">
                             <p>Short Qty: {detailView.shortQty}</p>
                             <p>Short Combo Qty: {detailView.shortComboQty}</p>
                          </div>
                        )}
                    </div>
                    <h4 className="font-bold text-xs uppercase text-slate-500 mb-2 px-1">Inward History</h4>
                    {detailView.inwards.length === 0 ? <p className="text-slate-400 italic text-sm text-center py-4 bg-slate-50 rounded-lg">No items received yet.</p> : (
                        <div className="overflow-x-auto rounded-lg border border-slate-100">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100">
                                    <tr>
                                      <th className="p-2 text-left">Date</th>
                                      <th className="p-2 text-right">Qty</th>
                                      <th className="p-2 text-left">Ent. By</th>
                                      <th className="p-2 text-left">Chk. By</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detailView.inwards.map(i => (
                                        <tr key={i.id} className="border-b last:border-0 hover:bg-slate-50">
                                            <td className="p-2 whitespace-nowrap">{formatDisplayDate(i.date)}</td>
                                            <td className="p-2 text-right font-bold">{i.qty}</td>
                                            <td className="p-2 text-slate-500 text-[10px] uppercase font-bold">{i.enteredBy || '---'}</td>
                                            <td className="p-2 text-slate-500 text-[10px] uppercase font-bold">{i.checkedBy || '---'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
                    {detailView.status !== 'COMPLETED' && (
                        <Button variant="secondary" onClick={() => markJobComplete(detailView.id)} className="bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-200 w-auto px-4">
                           <CheckCircle size={16} className="mr-2"/> Short Close
                        </Button>
                    )}
                    <Button onClick={() => setDetailView(null)} variant="outline" className="w-auto px-6">Close</Button>
                </div>
            </div>
        </div>
      )}

      <Card className="bg-blue-50 border-blue-100">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold text-blue-900">Cloud Sync</h3>
          <Button onClick={onManualSync} className="w-auto px-4 py-2 text-sm bg-blue-600">
             Sync & Refresh
          </Button>
        </div>
        <p className="text-[10px] text-blue-700 font-medium">Automatic sync attempts occur on save. Use this button for manual refresh or if authorization is lost.</p>
      </Card>

      <Card className="p-3">
         <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="relative">
                <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                <input className="w-full pl-10 p-2 border rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none" placeholder="Search Vendor, Challan, Item SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex gap-2">
                <input type="date" className="p-2 border rounded-lg flex-1 text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                <input type="date" className="p-2 border rounded-lg flex-1 text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="flex gap-2 flex-1">
                <select className="p-2 border rounded-lg flex-1 text-xs font-bold text-slate-600" value={sortBy} onChange={(e:any) => setSortBy(e.target.value)}>
                    <option value="date">Sort by Date</option>
                    <option value="qty">Qty</option>
                    <option value="overdue">Overdue</option>
                </select>
                <button className="p-2 border rounded-lg bg-slate-50" onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}>
                    {sortOrder === 'asc' ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                </button>
                <label className="flex items-center space-x-2 text-xs text-slate-600 font-bold cursor-pointer p-2 border rounded-lg bg-slate-50 hover:bg-slate-100">
                    <input type="checkbox" checked={hideCompleted} onChange={e => setHideCompleted(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                    <span className="whitespace-nowrap">Active Only</span>
                </label>
            </div>
         </div>
      </Card>

      <div className="space-y-3">
        {reportData.map((r) => {
            const days = Math.floor((new Date().getTime() - new Date(r.date).getTime()) / (1000 * 60 * 60 * 24));
            const isCompleted = r.status === 'COMPLETED' || r.pending <= 0;
            return (
                <div key={r.id} onClick={() => setDetailView(r)} className={`bg-white rounded-xl shadow-sm border ${isCompleted ? 'border-slate-100 opacity-80' : 'border-slate-200'} p-4 cursor-pointer hover:shadow-md transition-all relative overflow-hidden group`}>
                    {isCompleted && (
                       <div className={`absolute right-0 top-0 text-white text-[9px] font-black px-3 py-1 rounded-bl-lg uppercase tracking-wider ${r.shortQty > 0 ? 'bg-orange-500' : 'bg-green-600'}`}>
                          {r.shortQty > 0 ? 'SHORT CLOSED' : 'COMPLETED'}
                       </div>
                    )}
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <div className="font-black text-slate-800 text-lg leading-tight uppercase tracking-tight">{r.vendorName}</div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">CH#{r.challanNo} • {formatDisplayDate(r.date)}</div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={(e) => { e.stopPropagation(); printLabel(r.itemSku); }} className="text-blue-500 bg-blue-50 p-2 rounded-lg hover:bg-blue-100 transition-colors"><ScanBarcode size={18}/></button>
                          <button onClick={(e) => { e.stopPropagation(); setPrintEntry(r); setTimeout(()=>window.print(),100); }} className="text-green-500 bg-green-50 p-2 rounded-lg hover:bg-green-100 transition-colors"><Printer size={18}/></button>
                          <div className="text-slate-300 p-2 group-hover:text-blue-400 transition-colors"><Info size={18} /></div>
                        </div>
                    </div>
                    <div className="flex justify-between items-end border-t pt-3 mt-3">
                        <div className="space-y-1">
                            <div className="text-[10px] font-black text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded inline-block">{r.itemSku}</div>
                            <div className="text-sm font-bold text-slate-700 block">
                                {r.inQty} / {r.qty} <span className="text-slate-400 font-normal">Recv.</span>
                            </div>
                            {(r.comboQty ?? 0) > 0 && (
                               <div className="text-[10px] text-slate-500 italic">
                                  Combos: {r.inComboQty} / {r.comboQty}
                               </div>
                            )}
                            {r.recvDates.length > 0 && (
                                <div className="flex items-center text-[10px] text-blue-600 mt-1">
                                    <Calendar size={10} className="mr-1"/> 
                                    <span className="truncate max-w-[150px]">{r.recvDates.map(d => formatDisplayDate(d)).join(', ')}</span>
                                </div>
                            )}
                        </div>
                        {!isCompleted ? (
                             <div className="text-right">
                                <div className="text-2xl font-black text-orange-500">{r.pending}</div>
                                <div className="text-[10px] font-bold text-orange-600 uppercase tracking-tighter">{days} Days Pending</div>
                             </div>
                        ) : (
                             <div className="text-right">
                                {r.shortQty > 0 && <div className="text-orange-600 font-black text-xs">Short: {r.shortQty}</div>}
                                <div className="text-green-600 font-black flex items-center text-xs justify-end mt-1"><CheckCircle size={14} className="mr-1"/> DONE</div>
                             </div>
                        )}
                    </div>
                </div>
            );
        })}
        {reportData.length === 0 && <div className="text-center text-slate-400 py-12 bg-white rounded-2xl border border-dashed border-slate-200">No records found matching criteria.</div>}
      </div>
    </div>
  );
};

export default Report;