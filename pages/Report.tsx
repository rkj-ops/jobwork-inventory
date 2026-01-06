import React, { useMemo, useState, useEffect } from 'react';
import { AppState } from '../types';
import { Card, Button, Select, Input } from '../components/ui';
import { syncDataToSheets, signIn, isSignedIn, initGapi } from '../services/sheets';
import { RefreshCw, ChevronDown, ChevronUp, Settings, Trash2 } from 'lucide-react';

interface ReportProps {
  state: AppState;
  markSynced: (result: { 
    outwards: string[], 
    inwards: string[], 
    vendors: string[], 
    items: string[], 
    works: string[] 
  }) => void;
}

const Report: React.FC<ReportProps> = ({ state, markSynced }) => {
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGapiReady, setIsGapiReady] = useState(false);
  
  // Credentials State
  const [apiKey, setApiKey] = useState(localStorage.getItem('GOOGLE_API_KEY') || '');
  const [clientId, setClientId] = useState(localStorage.getItem('GOOGLE_CLIENT_ID') || '');
  const [showConfig, setShowConfig] = useState(false);

  const [selectedVendorFilter, setSelectedVendorFilter] = useState('');
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

  useEffect(() => {
    // Check if we can already use GAPI (if previously initialized)
    const checkGapi = () => {
      const gapi = (window as any).gapi;
      if (gapi && gapi.auth2 && gapi.client) {
        // Assume ready if loaded, but we might need to verify init status
        // Usually if auth2 is there, it's initialized
        if (gapi.auth2.getAuthInstance()) {
           setIsGapiReady(true);
        }
      } 
      
      // Auto-init if keys exist and not ready
      if ((!gapi || !gapi.auth2) && apiKey && clientId) {
         handleInitGapi();
      }
    };
    // Small delay to allow script load
    const timer = setTimeout(checkGapi, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleInitGapi = async () => {
    if (!apiKey || !clientId) {
      setSyncStatus('Please enter API Key and Client ID');
      return;
    }
    
    setIsSyncing(true);
    setSyncStatus('Initializing Google Services...');
    try {
      await initGapi(apiKey, clientId);
      localStorage.setItem('GOOGLE_API_KEY', apiKey);
      localStorage.setItem('GOOGLE_CLIENT_ID', clientId);
      setIsGapiReady(true);
      setSyncStatus('Ready to sync');
      setShowConfig(false);
    } catch (e: any) {
      console.error("GAPI Init Error", e);
      let msg = '';
      
      // Handle various GAPI error formats
      if (e?.error?.message) {
        msg = e.error.message;
      } else if (e?.details) {
        msg = e.details;
      } else if (e?.message) {
        msg = e.message;
      } else if (typeof e?.error === 'string') {
        msg = e.error;
      } else {
        msg = JSON.stringify(e);
      }
      
      if (msg.includes('origin_mismatch')) {
        msg = "Origin mismatch. Add this URL to 'Authorized JavaScript origins' in Google Cloud Console.";
      }
      
      setSyncStatus('Init Failed: ' + msg);
      setShowConfig(true); // Re-open config to let user fix
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearCredentials = () => {
    localStorage.removeItem('GOOGLE_API_KEY');
    localStorage.removeItem('GOOGLE_CLIENT_ID');
    setApiKey('');
    setClientId('');
    setSyncStatus('');
    setIsGapiReady(false);
  };

  // --- Calculations ---
  const vendorStats = useMemo(() => {
    return state.vendors.map(vendor => {
      const vendorOutwards = state.outwardEntries.filter(e => e.vendorId === vendor.id);
      
      let totalOutQty = 0;
      let totalInQty = 0;
      let totalPendingWeight = 0;

      // Detailed Challan Analysis
      const challans = vendorOutwards.map(out => {
        const inwardEntries = state.inwardEntries.filter(i => i.outwardChallanId === out.id);
        const inQty = inwardEntries.reduce((sum, i) => sum + i.qty, 0);
        const pendingQty = out.qty - inQty;
        
        totalOutQty += out.qty;
        totalInQty += inQty;
        
        // Approx pending weight based on average weight per unit of outward
        const avgWeight = out.qty > 0 ? out.materialWeight / out.qty : 0;
        totalPendingWeight += (pendingQty * avgWeight);

        return {
          ...out,
          inQty,
          pendingQty,
          status: pendingQty <= 0 ? 'Completed' : (inQty > 0 ? 'Partial' : 'Pending')
        };
      });

      return {
        vendor,
        totalOutQty,
        totalInQty,
        pendingQty: totalOutQty - totalInQty,
        totalPendingWeight,
        challans
      };
    });
  }, [state]);

  const filteredStats = selectedVendorFilter 
    ? vendorStats.filter(v => v.vendor.id === selectedVendorFilter)
    : vendorStats;

  const unsyncedCount = 
    state.outwardEntries.filter(e => !e.synced).length + 
    state.inwardEntries.filter(e => !e.synced).length +
    state.vendors.filter(e => !e.synced).length +
    state.items.filter(e => !e.synced).length +
    state.workTypes.filter(e => !e.synced).length;

  // --- Handlers ---

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStatus('Syncing...');
    
    try {
        const gapi = (window as any).gapi;
        
        // Ensure GAPI is actually initialized
        if (!gapi || !gapi.auth2 || !gapi.auth2.getAuthInstance()) {
             setSyncStatus('GAPI lost or not initialized. Re-connecting...');
             await handleInitGapi();
             // Check again
             if (!gapi.auth2 || !gapi.auth2.getAuthInstance()) {
               throw new Error("Could not initialize Google Auth");
             }
        }

        if (!isSignedIn()) {
          await signIn();
        }
        
        const result = await syncDataToSheets(state, markSynced);
        setSyncStatus(result.message);
    } catch (e: any) {
        console.error("Sync Error", e);
        let msg = e.message || e.error || JSON.stringify(e);
        if (typeof msg === 'object') msg = JSON.stringify(msg);
        setSyncStatus('Sync Error: ' + msg);
    } finally {
        setIsSyncing(false);
    }
  };

  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto">
      
      {/* Sync Control */}
      <Card className="bg-blue-50 border-blue-100">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="font-bold text-blue-900 flex items-center">
              Google Sheets Sync 
              <button onClick={() => setShowConfig(!showConfig)} className="ml-2 text-blue-400 hover:text-blue-700">
                <Settings size={16} />
              </button>
            </h3>
            <p className="text-sm text-blue-700">{unsyncedCount} records pending upload</p>
          </div>
          
          {isGapiReady ? (
            <Button 
              onClick={handleSync} 
              disabled={isSyncing || unsyncedCount === 0}
              className="w-auto px-6 py-2 flex items-center bg-blue-600 hover:bg-blue-700"
            >
              <RefreshCw size={18} className={`mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          ) : (
             <Button onClick={() => setShowConfig(true)} className="w-auto px-4 py-2 bg-orange-500 hover:bg-orange-600">
               Setup Sync
             </Button>
          )}
        </div>
        
        {/* Setup Config Area */}
        {showConfig && (
          <div className="mt-4 p-4 bg-white rounded border border-blue-200">
            <h4 className="text-sm font-bold mb-2">Drive API Configuration</h4>
            <Input 
              label="Client ID" 
              value={clientId} 
              onChange={e => setClientId(e.target.value)} 
              placeholder="e.g. 123...apps.googleusercontent.com"
            />
            <Input 
              label="API Key" 
              value={apiKey} 
              onChange={e => setApiKey(e.target.value)} 
              placeholder="e.g. AIzaSy..."
            />
            <div className="flex justify-between mt-4">
              <button onClick={handleClearCredentials} className="text-red-500 text-sm flex items-center">
                <Trash2 size={14} className="mr-1" /> Clear
              </button>
              <div className="flex space-x-2">
                <button onClick={() => setShowConfig(false)} className="px-3 py-2 text-slate-500">Cancel</button>
                <Button onClick={handleInitGapi} disabled={isSyncing} className="w-auto">
                  {isSyncing ? 'Connecting...' : 'Connect Service'}
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">Credentials are saved to your browser.</p>
          </div>
        )}

        {syncStatus && <p className="text-xs text-center mt-2 font-mono text-blue-800 break-words">{syncStatus}</p>}
      </Card>

      {/* Filter */}
      <div className="mb-4">
        <Select label="Filter by Vendor" value={selectedVendorFilter} onChange={e => setSelectedVendorFilter(e.target.value)}>
          <option value="">All Vendors</option>
          {state.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
      </div>

      {/* Vendor Cards */}
      <div className="space-y-4">
        {filteredStats.map(stat => (
          <div key={stat.vendor.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header / Summary */}
            <div 
              className="p-4 flex justify-between items-center cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors"
              onClick={() => setExpandedVendor(expandedVendor === stat.vendor.id ? null : stat.vendor.id)}
            >
              <div>
                <h3 className="font-bold text-lg">{stat.vendor.name}</h3>
                <div className="text-sm text-slate-500 mt-1">
                   Pending: <span className="font-semibold text-orange-600">{stat.pendingQty} Qty</span> 
                   <span className="mx-1">•</span> 
                   Est. Wt: {stat.totalPendingWeight.toFixed(2)}
                </div>
              </div>
              {expandedVendor === stat.vendor.id ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
            </div>

            {/* Detailed Table (Expanded) */}
            {expandedVendor === stat.vendor.id && (
              <div className="p-4 border-t border-slate-100 bg-white">
                {stat.challans.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm">No transactions found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b">
                        <tr>
                          <th className="px-2 py-2">Date/Challan</th>
                          <th className="px-2 py-2">Item</th>
                          <th className="px-2 py-2 text-right">Out</th>
                          <th className="px-2 py-2 text-right">In</th>
                          <th className="px-2 py-2 text-right">Bal</th>
                          <th className="px-2 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {stat.challans.map(ch => {
                          const item = state.items.find(i => i.id === ch.skuId);
                          return (
                            <tr key={ch.id}>
                              <td className="px-2 py-2">
                                <div className="font-medium">{ch.challanNo}</div>
                                <div className="text-xs text-slate-400">{ch.date.split('T')[0]}</div>
                              </td>
                              <td className="px-2 py-2 text-slate-600">{item?.sku}</td>
                              <td className="px-2 py-2 text-right font-medium">{ch.qty}</td>
                              <td className="px-2 py-2 text-right text-green-600">{ch.inQty}</td>
                              <td className="px-2 py-2 text-right font-bold text-orange-600">{ch.pendingQty}</td>
                              <td className="px-2 py-2">
                                <span className={`text-[10px] px-2 py-1 rounded-full font-semibold
                                  ${ch.status === 'Completed' ? 'bg-green-100 text-green-700' : 
                                    ch.status === 'Partial' ? 'bg-yellow-100 text-yellow-700' : 
                                    'bg-red-100 text-red-700'}`}>
                                  {ch.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        
        {filteredStats.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            No vendor data found.
          </div>
        )}
      </div>
    </div>
  );
};

export default Report;