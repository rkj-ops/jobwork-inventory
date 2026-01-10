import React, { useState, useEffect, useRef } from 'react';
import { AppState, Vendor, Item, WorkType, OutwardEntry, InwardEntry } from './types';
import { loadData, saveData } from './services/storage';
import { Header, TabBar } from './components/ui';
import { initGapi, syncDataToSheets } from './services/sheets';
import { RefreshCw } from 'lucide-react';

import Masters from './pages/Masters';
import Outward from './pages/Outward';
import Inward from './pages/Inward';
import Report from './pages/Report';

const APP_VERSION = "2.6.0-sync-fixed";

const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState('outward');
  const [state, setState] = useState<AppState>(loadData());
  const [isSyncing, setIsSyncing] = useState(false);
  const tokenClient = useRef<any>(null);
  
  const syncTargetRef = useRef<AppState>(state);

  useEffect(() => {
    saveData(state);
    syncTargetRef.current = state;
  }, [state]);

  // Unified update helper that can optionally trigger sync
  const updateAndSync = (newState: AppState, shouldSync: boolean = false) => {
    setState(newState);
    if (shouldSync) {
        triggerAutoSync(newState, false); // Auto sync doesn't prompt if possible
    }
  };

  const updateState = (k: keyof AppState, v: any) => {
    const newState = { ...state, [k]: v };
    updateAndSync(newState, k === 'outwardEntries'); // Trigger sync on outward updates (e.g. status changes)
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
    if (!apiKey || !clientId || isSyncing) return;

    syncTargetRef.current = latestState;
    setIsSyncing(true);

    try {
      await initGapi(apiKey);
      const google = (window as any).google;
      
      if (!tokenClient.current && google?.accounts?.oauth2) {
        tokenClient.current = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
          callback: async (resp: any) => {
            if (resp.error) {
              console.error("OAuth Error:", resp);
              setIsSyncing(false);
              // Only alert if the error is severe or if user explicitly requested sync
              if (forcePrompt) alert(`Auth Error: ${resp.error_description || resp.error}`);
              return;
            }
            (window as any).gapi.client.setToken(resp);
            await syncDataToSheets(syncTargetRef.current, handleSyncComplete);
            setIsSyncing(false);
          },
        });
      }

      if (tokenClient.current) {
        // use prompt: 'none' to try and get a token silently if possible
        // only use forcePrompt/standard request if 'none' fails or we are in a manual flow
        tokenClient.current.requestAccessToken({ prompt: forcePrompt ? 'select_account' : '' });
      } else {
        setIsSyncing(false);
      }
    } catch (e) {
      console.error("Auto-sync trigger failed", e);
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
        action={isSyncing && (
          <div className="flex items-center text-blue-600 text-[10px] font-bold uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-full animate-pulse border border-blue-100">
            <RefreshCw size={12} className="mr-2 animate-spin" />
            Syncing...
          </div>
        )}
      />
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
