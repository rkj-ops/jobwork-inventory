import React, { useState, useEffect, useRef } from 'react';
import { AppState, Vendor, Item, WorkType, OutwardEntry, InwardEntry } from './types';
import { loadData, saveData } from './services/storage';
import { Header, TabBar } from './components/ui';
import { initGapi, syncDataToSheets } from './services/sheets';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import Masters from './pages/Masters';
import Outward from './pages/Outward';
import Inward from './pages/Inward';
import Report from './pages/Report';

const APP_VERSION = "2.8.0-auth-optimized";

const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState('outward');
  const [state, setState] = useState<AppState>(loadData());
  const [isSyncing, setIsSyncing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const tokenClient = useRef<any>(null);
  
  const syncTargetRef = useRef<AppState>(state);

  // Auto-init credentials if missing
  useEffect(() => {
    if (!localStorage.getItem('GOOGLE_CLIENT_ID')) {
        localStorage.setItem('GOOGLE_CLIENT_ID', '1066501284390-o19fpc6g5voo2dahe5o9ct5esa5743ht.apps.googleusercontent.com');
        localStorage.setItem('GOOGLE_CLIENT_SECRET', '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');
    }
  }, []);

  useEffect(() => {
    saveData(state);
    syncTargetRef.current = state;
  }, [state]);

  const updateAndSync = (newState: AppState, shouldSync: boolean = false) => {
    setState(newState);
    if (shouldSync) {
        triggerAutoSync(newState, false);
    }
  };

  const updateState = (k: keyof AppState, v: any) => {
    const newState = { ...state, [k]: v };
    updateAndSync(newState, k === 'outwardEntries');
  };
  
  const addOutwardEntry = (entry: OutwardEntry) => {
    const newState = { ...state, outwardEntries: [...state.outwardEntries, entry] };
    updateAndSync(newState, true);
  };

  const addInwardEntry = (entry: InwardEntry) => {
    const newState = { ...state, inwardEntries: [...state.inwardEntries, entry] };
    updateAndSync(newState, true);
  };

  const handleAddItem = (item: Item) => setState(prev => ({ ...prev, items: [...prev.items, item] }));
  const handleSyncComplete = (newState: AppState) => setState(newState);

  const triggerAutoSync = async (latestState: AppState, forcePrompt: boolean = false) => {
    const apiKey = localStorage.getItem('GOOGLE_API_KEY');
    const clientId = localStorage.getItem('GOOGLE_CLIENT_ID');
    
    if (!apiKey || !clientId) {
        if (forcePrompt) setAuthError("Missing API Key or Client ID in Setup.");
        return;
    }
    
    if (isSyncing) return;

    setAuthError(null);
    syncTargetRef.current = latestState;
    setIsSyncing(true);

    try {
      await initGapi(apiKey);
      const google = (window as any).google;
      
      if (!google?.accounts?.oauth2) {
        throw new Error("Google Identity Services script not loaded.");
      }

      if (!tokenClient.current) {
        tokenClient.current = google.accounts.oauth2.initTokenClient({
          client_id: clientId.trim(),
          scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
          callback: async (resp: any) => {
            if (resp.error) {
              console.error("OAuth Callback Error:", resp);
              let errorMsg = resp.error_description || resp.error;
              if (errorMsg === "idpiframe_initialization_failed") {
                  errorMsg = "Origin Mismatch: Verify authorized origins in Google Console.";
              }
              setAuthError(errorMsg);
              setIsSyncing(false);
              return;
            }
            const gapi = (window as any).gapi;
            gapi.client.setToken(resp);
            const syncResult = await syncDataToSheets(syncTargetRef.current, handleSyncComplete);
            if (!syncResult.success) setAuthError(syncResult.message);
            setIsSyncing(false);
          },
          error_callback: (err: any) => {
              console.error("Token Client Error:", err);
              setAuthError(err.message || "OAuth initialization failed.");
              setIsSyncing(false);
          }
        });
      }

      if (tokenClient.current) {
        // Attempt re-use if forcePrompt is false. mobile chrome behaves better with prompt: '' (empty)
        tokenClient.current.requestAccessToken({ 
            prompt: forcePrompt ? 'select_account' : '',
            hint: localStorage.getItem('last_user_email') || undefined
        });
      } else {
        setIsSyncing(false);
      }
    } catch (e: any) {
      console.error("Sync Trigger Failed:", e);
      setAuthError(e.message || "Failed to start sync process.");
      setIsSyncing(false);
    }
  };

  const renderContent = () => {
    switch (currentTab) {
      case 'masters': return <Masters state={state} updateState={updateState} />;
      case 'outward': return <Outward state={state} onSave={addOutwardEntry} onAddItem={handleAddItem} />;
      case 'inward': return <Inward state={state} onSave={addInwardEntry} updateState={updateState} />;
      case 'recon': return <Report state={state} markSynced={handleSyncComplete} updateState={updateState} onManualSync={() => triggerAutoSync(state, true)} />;
      default: return <div>Page not found</div>;
    }
  };

  const getTitle = () => {
    switch(currentTab) {
      case 'masters': return 'Setup & Masters';
      case 'outward': return 'Outward Entry';
      case 'inward': return 'Inward Entry';
      case 'recon': return 'Reconciliation Report';
      default: return 'Inventory';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header 
        title={getTitle()} 
        action={isSyncing ? (
          <div className="flex items-center text-blue-600 text-[10px] font-bold uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-full animate-pulse border border-blue-100">
            <RefreshCw size={12} className="mr-2 animate-spin" />
            Syncing...
          </div>
        ) : authError ? (
           <div onClick={() => triggerAutoSync(state, true)} className="flex items-center text-red-600 text-[10px] font-bold uppercase tracking-widest bg-red-50 px-3 py-1.5 rounded-full border border-red-100 cursor-pointer">
             <AlertTriangle size={12} className="mr-2" />
             Auth Error
           </div>
        ) : null}
      />

      {authError && (
          <div className="bg-red-600 text-white text-[11px] p-3 text-center font-bold sticky top-[65px] z-30 shadow-lg animate-in fade-in slide-in-from-top duration-300">
              {authError}
              <button onClick={() => setAuthError(null)} className="ml-4 underline opacity-80 uppercase tracking-tighter">Dismiss</button>
          </div>
      )}

      <main className="max-w-5xl mx-auto flex-1 w-full">
        {renderContent()}
      </main>
      
      <footer className="w-full text-center py-8 pb-32 text-[10px] font-mono text-slate-400 tracking-widest no-print border-t border-slate-100 mt-10">
          JW TRACKER SYSTEM • VERSION: {APP_VERSION}
      </footer>

      <TabBar currentTab={currentTab} setTab={setCurrentTab} />
    </div>
  );
};

export default App;