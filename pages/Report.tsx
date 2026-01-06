import React, { useMemo, useState, useEffect, useRef } from 'react';
import { AppState, OutwardEntry } from '../types';
import { Card, Button, Select, Input } from '../components/ui';
import { syncDataToSheets, initGapi } from '../services/sheets';
import { RefreshCw, ChevronDown, ChevronUp, Settings, Trash2, FileDown, Printer } from 'lucide-react';
import PrintChallan from '../components/PrintChallan';

interface ReportProps {
  state: AppState;
  markSynced: (newState: AppState) => void;
}

const Report: React.FC<ReportProps> = ({ state, markSynced }) => {
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('GOOGLE_API_KEY') || '');
  const [clientId, setClientId] = useState(localStorage.getItem('GOOGLE_CLIENT_ID') || '');
  const [showConfig, setShowConfig] = useState(false);
  const [printEntry, setPrintEntry] = useState<OutwardEntry | null>(null);
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
    if (!apiKey || !clientId) { setShowConfig(true); return; }
    setIsSyncing(true); setSyncStatus('Connecting...');
    try {
      await initGapi(apiKey, clientId);
      if (!tokenClient.current) initTokenClient(clientId);
      tokenClient.current.requestAccessToken({ prompt: '' });
      localStorage.setItem('GOOGLE_API_KEY', apiKey); 
      localStorage.setItem('GOOGLE_CLIENT_ID', clientId);
    } catch (e: any) {
      console.error(e);
      setSyncStatus(`Error: ${e.message || 'Check Console'}`);
      setIsSyncing(false);
      setShowConfig(true);
    }
  };

  const handleDownloadCSV = () => {
    const headers = "Vendor,ChallanNo,OutwardDate,PendingDays,SKU,OutQty,InQty,PendingQty,TotalWt,MatWt,Status\n";
    const rows = stats.flatMap((s:any) => s.rows.map((r:any) => {
        const item = state.items.find((i:any) => i.id === r.skuId);
        const days = Math.floor((new Date().getTime() - new Date(r.date).getTime()) / (1000 * 60 * 60 * 24));
        return `${s.vendor.name},${r.challanNo},${r.date.split('T')[0]},${days},${item?.sku || ''},${r.qty},${r.inQty},${r.pending},${r.totalWeight},${r.materialWeight},${r.pending > 0 ? 'Pending' : 'Completed'}`;
    })).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `JobWork_Recon_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  };

  const stats = useMemo(() => {
    return state.vendors.map(v => {
      const outs = state.outwardEntries.filter(e => e.vendorId === v.id);
      const rows = outs.map(o => {
        const inQty = state.inwardEntries.filter(i => i.outwardChallanId === o.id).reduce((s, i) => s + i.qty, 0);
        return { ...o, inQty, pending: o.qty - inQty };
      });
      const pendingTotal = rows.reduce((s, r) => s + r.pending, 0);
      return { vendor: v, pendingTotal, rows: rows.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()) };
    }).filter(x => x.rows.length > 0);
  }, [state]);

  if (printEntry) return <PrintChallan entry={printEntry} state={state} onClose={() => setPrintEntry(null)} />;

  const unsyncedCount = state.outwardEntries.filter(e=>!e.synced).length + state.inwardEntries.filter(e=>!e.synced).length + state.vendors.filter(e=>!e.synced).length;

  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto">
      <Card className="bg-blue-50 border-blue-100">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h3 className="font-bold text-blue-900">Google Sync ({unsyncedCount} pending)</h3>
          </div>
          <div className="flex space-x-2">
             <Button onClick={handleSync} disabled={isSyncing} className="w-auto px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700">
                {isSyncing ? '...' : 'Sync & Download'}
             </Button>
             <button onClick={() => setShowConfig(!showConfig)} className="text-blue-400 p-2"><Settings size={20} /></button>
          </div>
        </div>
        <Button onClick={handleDownloadCSV} variant="secondary" className="text-xs py-2 w-full mb-2"><FileDown size={14} className="mr-2"/> Download CSV</Button>
        {syncStatus && <p className="text-xs font-mono text-blue-800 break-all bg-white p-2 rounded">{syncStatus}</p>}
        {showConfig && (
          <div className="mt-4 p-4 bg-white rounded border">
            <Input label="Client ID" value={clientId} onChange={e => setClientId(e.target.value)} />
            <Input label="API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} />
          </div>
        )}
      </Card>

      {stats.map(s => (
        <div key={s.vendor.id} className="bg-white rounded-xl shadow-sm border border-slate-200 mb-4 overflow-hidden">
          <div className="p-4 bg-slate-50 flex justify-between">
             <div className="font-bold text-lg">{s.vendor.name}</div>
             <div className={`${s.pendingTotal > 0 ? 'text-orange-600' : 'text-green-600'} font-bold`}>{s.pendingTotal} Pending</div>
          </div>
          <div className="divide-y divide-slate-100">
            {s.rows.map(r => {
               const item = state.items.find(i => i.id === r.skuId);
               const days = Math.floor((new Date().getTime() - new Date(r.date).getTime()) / (1000 * 60 * 60 * 24));
               return (
                 <div key={r.id} className="p-3 text-sm">
                   <div className="flex justify-between items-center mb-1">
                      <span className="font-mono font-bold text-slate-600">{r.challanNo}</span>
                      <span className="text-xs text-slate-400">{r.date.split('T')[0]}</span>
                      <button onClick={() => { setPrintEntry(r); setTimeout(()=>window.print(),100); }} className="text-blue-500 hover:bg-blue-50 p-1 rounded"><Printer size={14}/></button>
                   </div>
                   <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-slate-800">{item?.sku}</span>
                      <span className="font-mono">{r.inQty} / {r.qty}</span>
                   </div>
                   {r.pending > 0 ? (
                      <div className="text-xs text-orange-500 font-bold text-right">{r.pending} PENDING ({days} Days)</div>
                   ) : (
                      <div className="text-xs text-green-600 font-bold text-right">COMPLETED</div>
                   )}
                 </div>
               );
            })}
          </div>
        </div>
      ))}
      {!stats.length && <div className="text-center text-slate-400 mt-10">No data found.</div>}
    </div>
  );
};

export default Report;