import React, { useMemo, useState, useRef } from 'react';
import { AppState, OutwardEntry, InwardEntry } from '../types';
import { Card, Button } from '../components/ui';
import { syncDataToSheets, initGapi } from '../services/sheets';
import { ChevronDown, ChevronUp, Trash2, Printer, CheckCircle, Search } from 'lucide-react';
import PrintChallan from '../components/PrintChallan';

interface ReportProps {
  state: AppState;
  markSynced: (newState: AppState) => void;
  updateState?: (k: keyof AppState, v: any) => void;
}

const Report: React.FC<ReportProps> = ({ state, markSynced, updateState }) => {
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [printEntry, setPrintEntry] = useState<OutwardEntry | null>(null);
  const [detailView, setDetailView] = useState<{ outward: OutwardEntry, inwards: InwardEntry[] } | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'qty' | 'overdue'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [hideCompleted, setHideCompleted] = useState(false);

  const tokenClient = useRef<any>(null);

  const initTokenClient = (id: string) => {
    const google = (window as any).google;
    if (google?.accounts?.oauth2) {
      tokenClient.current = google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
        callback: async (resp: any) => {
          if (resp.error) {
             setSyncStatus(`Auth Error: ${resp.error}`);
             setIsSyncing(false);
             return;
          }
          const gapi = (window as any).gapi;
          if (gapi.client) gapi.client.setToken(resp);
          await performSync();
        },
      });
    }
  };

  const performSync = async () => {
    setSyncStatus('Syncing...');
    const res = await syncDataToSheets(state, markSynced);
    setSyncStatus(res.message);
    setIsSyncing(false);
  };

  const handleSync = async () => {
    const apiKey = localStorage.getItem('GOOGLE_API_KEY');
    const clientId = localStorage.getItem('GOOGLE_CLIENT_ID');
    if (!apiKey || !clientId) { 
        alert("Please configure API Keys in Setup menu first.");
        return; 
    }
    setIsSyncing(true); setSyncStatus('Connecting...');
    try {
      await initGapi(apiKey);
      if (!tokenClient.current) initTokenClient(clientId);
      tokenClient.current.requestAccessToken({ prompt: '' });
    } catch (e: any) {
      setSyncStatus(`Error: ${e.message}`);
      setIsSyncing(false);
    }
  };

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

  const reportData = useMemo(() => {
    let rows = state.outwardEntries.map(o => {
        const inwards = state.inwardEntries.filter(i => i.outwardChallanId === o.id);
        const inQty = inwards.reduce((s, i) => s + i.qty, 0);
        const lastRecvDate = inwards.length > 0 ? inwards.map(i => i.date).sort().pop() : null;
        const vendor = state.vendors.find(v => v.id === o.vendorId);
        const item = state.items.find(i => i.id === o.skuId);
        const work = state.workTypes.find(w => w.id === o.workId);
        let pending = o.status === 'COMPLETED' ? 0 : o.qty - inQty;

        return {
            ...o,
            vendorName: vendor?.name || 'Unknown',
            vendorCode: vendor?.code || 'UNK',
            itemSku: item?.sku || 'UNK',
            workName: work?.name || '',
            inQty,
            pending,
            lastRecvDate,
            inwards
        };
    });

    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        rows = rows.filter(r => 
            r.vendorName.toLowerCase().includes(lower) || 
            r.vendorCode.toLowerCase().includes(lower) || 
            r.challanNo.toLowerCase().includes(lower)
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
                    <h3 className="font-bold text-lg">Details: #{detailView.outward.challanNo}</h3>
                    <button onClick={() => setDetailView(null)}><Trash2 className="rotate-45" /></button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                    <div className="mb-4 bg-blue-50 p-3 rounded-lg text-sm">
                        <p><strong>Vendor:</strong> {detailView.outward.vendorName}</p>
                        <p><strong>Sent Date:</strong> {new Date(detailView.outward.date).toLocaleDateString()}</p>
                        <p><strong>Total Qty:</strong> {detailView.outward.qty}</p>
                        <p><strong>Status:</strong> {detailView.outward.status || 'OPEN'}</p>
                    </div>
                    <h4 className="font-bold text-xs uppercase text-slate-500 mb-2">Inward History</h4>
                    {detailView.inwards.length === 0 ? <p className="text-slate-400 italic text-sm">No items received yet.</p> : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100">
                                    <tr><th className="p-2 text-left">Date</th><th className="p-2 text-right">Qty</th><th className="p-2 text-left">Remarks</th></tr>
                                </thead>
                                <tbody>
                                    {detailView.inwards.map(i => (
                                        <tr key={i.id} className="border-b">
                                            <td className="p-2">{new Date(i.date).toLocaleDateString()}</td>
                                            <td className="p-2 text-right">{i.qty}</td>
                                            <td className="p-2 text-slate-500 text-xs">{i.remarks}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t bg-slate-50 flex justify-end">
                    {detailView.outward.status !== 'COMPLETED' && (
                        <Button variant="secondary" onClick={() => markJobComplete(detailView.outward.id)} className="bg-orange-100 text-orange-700 hover:bg-orange-200">
                           <CheckCircle size={16} className="mr-2"/> Mark Complete (Short Close)
                        </Button>
                    )}
                </div>
            </div>
        </div>
      )}

      <Card className="bg-blue-50 border-blue-100">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold text-blue-900">Cloud Sync</h3>
          <Button onClick={handleSync} disabled={isSyncing} className="w-auto px-4 py-2 text-sm bg-blue-600">
             {isSyncing ? '...' : 'Sync Data'}
          </Button>
        </div>
        {syncStatus && <p className="text-[10px] font-mono text-blue-800 break-all bg-white p-1 rounded">{syncStatus}</p>}
      </Card>

      <Card className="p-3">
         <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="relative">
                <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                <input className="w-full pl-10 p-2 border rounded-lg bg-slate-50" placeholder="Search Vendor Name, Challan..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex gap-2">
                <input type="date" className="p-2 border rounded-lg flex-1" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                <input type="date" className="p-2 border rounded-lg flex-1" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="flex gap-2 flex-1">
                <select className="p-2 border rounded-lg flex-1" value={sortBy} onChange={(e:any) => setSortBy(e.target.value)}>
                    <option value="date">Sort by Date</option>
                    <option value="qty">Qty</option>
                    <option value="overdue">Overdue</option>
                </select>
                <button className="p-2 border rounded-lg bg-slate-50" onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}>
                    {sortOrder === 'asc' ? <ChevronUp /> : <ChevronDown />}
                </button>
                <label className="flex items-center space-x-2 text-xs text-slate-600 font-bold cursor-pointer p-2 border rounded-lg bg-slate-50 hover:bg-slate-100">
                    <input type="checkbox" checked={hideCompleted} onChange={e => setHideCompleted(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                    <span>Active Only</span>
                </label>
            </div>
         </div>
      </Card>

      <div className="space-y-3">
        {reportData.map((r) => {
            const days = Math.floor((new Date().getTime() - new Date(r.date).getTime()) / (1000 * 60 * 60 * 24));
            const isCompleted = r.status === 'COMPLETED' || r.pending <= 0;
            return (
                <div key={r.id} onClick={() => setDetailView({ outward: r, inwards: r.inwards })} className={`bg-white rounded-xl shadow-sm border border-slate-200 p-4 cursor-pointer hover:shadow-md transition-shadow relative overflow-hidden`}>
                    {isCompleted && <div className="absolute right-0 top-0 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">COMPLETED</div>}
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <div className="font-bold text-lg leading-tight">{r.vendorName}</div>
                            <div className="text-xs text-slate-500 font-mono">#{r.challanNo} • {new Date(r.date).toLocaleDateString()}</div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setPrintEntry(r); setTimeout(()=>window.print(),100); }} className="text-blue-500 p-2"><Printer size={18}/></button>
                    </div>
                    <div className="flex justify-between items-end border-t pt-2 mt-2">
                        <div>
                            <div className="text-xs font-black text-slate-400 uppercase">{r.itemSku}</div>
                            <div className="text-sm font-bold mt-1 text-slate-700">
                                {r.inQty} / {r.qty} Recv.
                            </div>
                        </div>
                        {!isCompleted ? (
                             <div className="text-right">
                                <div className="text-xl font-black text-orange-500">{r.pending}</div>
                                <div className="text-[10px] font-bold text-orange-600 uppercase">{days} Days Open</div>
                             </div>
                        ) : (
                             <div className="text-green-600 font-bold flex items-center text-sm"><CheckCircle size={14} className="mr-1"/> Closed</div>
                        )}
                    </div>
                </div>
            );
        })}
        {reportData.length === 0 && <div className="text-center text-slate-400 py-10">No records found.</div>}
      </div>
    </div>
  );
};

export default Report;