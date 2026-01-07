import React, { useMemo, useState, useEffect, useRef } from 'react';
import { AppState, OutwardEntry, InwardEntry } from '../types';
import { Card, Button, Select, Input } from '../components/ui';
import { syncDataToSheets, initGapi } from '../services/sheets';
import { RefreshCw, ChevronDown, ChevronUp, Settings, Trash2, FileDown, Printer, AlertTriangle, Search, Filter, Eye, CheckCircle } from 'lucide-react';
import PrintChallan from '../components/PrintChallan';

interface ReportProps {
  state: AppState;
  markSynced: (newState: AppState) => void;
  updateState?: (k: keyof AppState, v: any) => void; // Added to handle manual status update
}

const Report: React.FC<ReportProps> = ({ state, markSynced, updateState }) => {
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [printEntry, setPrintEntry] = useState<OutwardEntry | null>(null);
  const [detailView, setDetailView] = useState<{ outward: OutwardEntry, inwards: InwardEntry[] } | null>(null);
  
  // Filters & Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'qty' | 'overdue'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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
      console.error(e);
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

  // Process Data
  const reportData = useMemo(() => {
    let rows = state.outwardEntries.map(o => {
        const inwards = state.inwardEntries.filter(i => i.outwardChallanId === o.id);
        const inQty = inwards.reduce((s, i) => s + i.qty, 0);
        const lastRecvDate = inwards.length > 0 
            ? inwards.map(i => i.date).sort().pop() 
            : null;
        const vendor = state.vendors.find(v => v.id === o.vendorId);
        const item = state.items.find(i => i.id === o.skuId);
        
        let pending = o.qty - inQty;
        // If manually completed, pending is effectively 0 for display logic purposes
        if(o.status === 'COMPLETED') pending = 0; 

        return {
            ...o,
            vendorName: vendor?.name || 'Unknown',
            vendorCode: vendor?.code || 'UNK',
            itemSku: item?.sku || 'UNK',
            inQty,
            pending,
            lastRecvDate,
            inwards
        };
    });

    // Filtering
    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        rows = rows.filter(r => 
            r.vendorCode.toLowerCase().includes(lower) || 
            r.challanNo.toLowerCase().includes(lower)
        );
    }
    if (dateFrom) rows = rows.filter(r => r.date >= dateFrom);
    if (dateTo) rows = rows.filter(r => r.date <= dateTo);

    // Sorting
    rows.sort((a, b) => {
        let diff = 0;
        if (sortBy === 'date') diff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (sortBy === 'qty') diff = a.qty - b.qty;
        if (sortBy === 'overdue') {
            const now = new Date().getTime();
            const daysA = (now - new Date(a.date).getTime());
            const daysB = (now - new Date(b.date).getTime());
            diff = daysA - daysB;
        }
        return sortOrder === 'asc' ? diff : -diff;
    });

    return rows;
  }, [state, searchTerm, dateFrom, dateTo, sortBy, sortOrder]);

  if (printEntry) return <PrintChallan entry={printEntry} state={state} onClose={() => setPrintEntry(null)} />;

  return (
    <div className="p-4 pb-24 max-w-4xl mx-auto">
      {/* Modal for Details */}
      {detailView && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-lg">Details: #{detailView.outward.challanNo}</h3>
                    <button onClick={() => setDetailView(null)}><Trash2 className="rotate-45" /></button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                    <div className="mb-4 bg-blue-50 p-3 rounded-lg text-sm">
                        <p><strong>Vendor:</strong> {state.vendors.find(v => v.id === detailView.outward.vendorId)?.name}</p>
                        <p><strong>Sent Date:</strong> {new Date(detailView.outward.date).toLocaleDateString()}</p>
                        <p><strong>Total Qty:</strong> {detailView.outward.qty}</p>
                        <p><strong>Status:</strong> {detailView.outward.status || 'OPEN'}</p>
                    </div>
                    <h4 className="font-bold text-xs uppercase text-slate-500 mb-2">Inward History</h4>
                    {detailView.inwards.length === 0 ? <p className="text-slate-400 italic text-sm">No items received yet.</p> : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100">
                                <tr>
                                    <th className="p-2 text-left">Date</th>
                                    <th className="p-2 text-right">Qty</th>
                                    <th className="p-2 text-left">Remarks</th>
                                </tr>
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

      {/* Sync Header */}
      <Card className="bg-blue-50 border-blue-100">
        <div className="flex justify-between items-center mb-2">
          <div><h3 className="font-bold text-blue-900">Google Sync</h3></div>
          <Button onClick={handleSync} disabled={isSyncing} className="w-auto px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700">
             {isSyncing ? '...' : 'Sync & Download'}
          </Button>
        </div>
        {syncStatus && <p className="text-xs font-mono text-blue-800 break-all bg-white p-2 rounded">{syncStatus}</p>}
      </Card>

      {/* Filters */}
      <Card className="p-3">
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <div className="relative">
                    <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input className="w-full pl-10 p-2 border rounded-lg bg-slate-50" placeholder="Search Vendor, Challan..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
            </div>
            <div className="flex gap-2">
                <input type="date" className="p-2 border rounded-lg flex-1" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                <span className="self-center">-</span>
                <input type="date" className="p-2 border rounded-lg flex-1" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="flex gap-2">
                <select className="p-2 border rounded-lg flex-1" value={sortBy} onChange={(e:any) => setSortBy(e.target.value)}>
                    <option value="date">Sort by Date</option>
                    <option value="qty">Sort by Qty</option>
                    <option value="overdue">Sort by Overdue</option>
                </select>
                <button className="p-2 border rounded-lg bg-slate-50" onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}>
                    {sortOrder === 'asc' ? <ChevronUp /> : <ChevronDown />}
                </button>
            </div>
         </div>
      </Card>

      {/* List */}
      <div className="space-y-3">
        {reportData.map((r) => {
            const days = Math.floor((new Date().getTime() - new Date(r.date).getTime()) / (1000 * 60 * 60 * 24));
            const isCompleted = r.status === 'COMPLETED' || r.pending <= 0;
            
            return (
                <div key={r.id} onClick={() => setDetailView({ outward: r, inwards: r.inwards })} className={`bg-white rounded-xl shadow-sm border border-slate-200 p-4 cursor-pointer hover:shadow-md transition-shadow relative overflow-hidden`}>
                    {isCompleted && <div className="absolute right-0 top-0 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">COMPLETED</div>}
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <div className="font-bold text-lg">{r.vendorName}</div>
                            <div className="text-xs text-slate-500 font-mono">#{r.challanNo} • {new Date(r.date).toLocaleDateString()}</div>
                        </div>
                        <div className="flex flex-col items-end">
                             <button onClick={(e) => { e.stopPropagation(); setPrintEntry(r); setTimeout(()=>window.print(),100); }} className="text-blue-500 hover:bg-blue-50 p-2 rounded-full mb-1"><Printer size={16}/></button>
                             {r.lastRecvDate && <div className="text-[10px] text-slate-400">Last Recv: {new Date(r.lastRecvDate).toLocaleDateString()}</div>}
                        </div>
                    </div>
                    
                    <div className="flex justify-between items-end border-t pt-2 mt-2">
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase">{r.itemSku}</div>
                            <div className="text-sm">
                                <span className="font-bold">{r.inQty}</span> / {r.qty} Received
                            </div>
                        </div>
                        {!isCompleted ? (
                             <div className="text-right">
                                <div className="text-xl font-black text-orange-500">{r.pending}</div>
                                <div className="text-[10px] font-bold text-orange-600 uppercase">{days} Days Open</div>
                             </div>
                        ) : (
                             <div className="text-green-600 font-bold flex items-center"><CheckCircle size={16} className="mr-1"/> Closed</div>
                        )}
                    </div>
                </div>
            );
        })}
        {reportData.length === 0 && <div className="text-center text-slate-400 py-10">No records match your filters.</div>}
      </div>
    </div>
  );
};

export default Report;