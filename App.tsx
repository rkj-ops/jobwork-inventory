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

const APP_VERSION = "2.4.5-stable-reco";

const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState('outward');
  const [state, setState] = useState<AppState>(loadData());
  const [isSyncing, setIsSyncing] = useState(false);
  const tokenClient = useRef<any>(null);
  
  // Use a ref to always have access to the latest state within sync callbacks
  const stateRef = useRef<AppState>(state);
  useEffect(() => {
    stateRef.current = state;
    saveData(state);
  }, [state]);

  const updateState = (k: keyof AppState, v: any) => setState(prev => ({ ...prev, [k]: v }));
  
  const addOutwardEntry = (entry: OutwardEntry) => {
    const newState = { ...state, outwardEntries: [...state.outwardEntries, entry] };
    setState(newState);
    // Trigger sync with the specific new state to avoid race conditions
    triggerAutoSync(newState);
  };

  const addInwardEntry = (entry: InwardEntry) => {
    const newState = { ...state, inwardEntries: [...state.inwardEntries, entry] };
    setState(newState);
    triggerAutoSync(newState);
  };

  const handleAddItem = (item: Item) => setState(prev => ({ ...prev, items: [...prev.items, item] }));
  const handleSyncComplete = (newState: AppState) => setState(newState);

  const triggerAutoSync = async (latestState?: AppState) => {
    const apiKey = localStorage.getItem('GOOGLE_API_KEY');
    const clientId = localStorage.getItem('GOOGLE_CLIENT_ID');
    if (!apiKey || !clientId || isSyncing) return;

    // Use the passed state or the ref value (guaranteed latest)
    const dataToSync = latestState || stateRef.current;

    setIsSyncing(true);
    try {
      await initGapi(apiKey);
      const google = (window as any).google;
      if (!tokenClient.current && google?.accounts?.oauth2) {
        tokenClient.current = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
          callback: async (resp: any) => {
            if (resp.error) { setIsSyncing(false); return; }
            (window as any).gapi.client.setToken(resp);
            // Always sync the state that was intended to be synced
            await syncDataToSheets(dataToSync, handleSyncComplete);
            setIsSyncing(false);
          },
        });
      }
      if (tokenClient.current) {
        tokenClient.current.requestAccessToken({ prompt: '' });
      } else {
        setIsSyncing(false);
      }
    } catch (e) {
      console.error("Auto-sync failed", e);
      setIsSyncing(false);
    }
  };

  const renderContent = () => {
    switch (currentTab) {
      case 'masters': return <Masters state={state} updateState={updateState} />;
      case 'outward': return <Outward state={state} onSave={addOutwardEntry} onAddItem={handleAddItem} />;
      case 'inward': return <Inward state={state} onSave={addInwardEntry} updateState={updateState} />;
      case 'recon': return <Report state={state} markSynced={handleSyncComplete} updateState={updateState} />;
      default: return <div>Page not found</div>;
    }
  };

  const getTitle = () => {
    switch(currentTab) {
      case 'masters': return 'Setup & Data';
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
          <div className="flex items-center text-blue-600 text-[10px] font-bold uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-full animate-pulse">
            <RefreshCw size={12} className="mr-1 animate-spin" />
            Syncing
          </div>
        )}
      />
      <main className="max-w-5xl mx-auto flex-1 w-full">
        {renderContent()}
      </main>
      
      <footer className="w-full text-center py-6 pb-32 text-[10px] font-mono text-slate-400 tracking-widest no-print">
          JW TRACKER SYSTEM • DEPLOYMENT VERSION: {APP_VERSION}
      </footer>

      <TabBar currentTab={currentTab} setTab={setCurrentTab} />
    </div>
  );
};

export default App;