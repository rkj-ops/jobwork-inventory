import React, { useState, useEffect } from 'react';
import { AppState, Vendor, Item, WorkType, OutwardEntry, InwardEntry } from './types';
import { loadData, saveData } from './services/storage';
import { Header, TabBar } from './components/ui';

// Pages
import Masters from './pages/Masters';
import Outward from './pages/Outward';
import Inward from './pages/Inward';
import Report from './pages/Report';

const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState('outward');
  const [state, setState] = useState<AppState>(loadData());

  // Save to local storage whenever state changes
  useEffect(() => {
    saveData(state);
  }, [state]);

  // State update helpers
  const updateVendors = (vendors: Vendor[]) => setState(prev => ({ ...prev, vendors }));
  const updateItems = (items: Item[]) => setState(prev => ({ ...prev, items }));
  const updateWorkTypes = (workTypes: WorkType[]) => setState(prev => ({ ...prev, workTypes }));
  
  const addOutwardEntry = (entry: OutwardEntry) => {
    setState(prev => ({
      ...prev,
      outwardEntries: [...prev.outwardEntries, entry]
    }));
  };

  const addInwardEntry = (entry: InwardEntry) => {
    setState(prev => ({
      ...prev,
      inwardEntries: [...prev.inwardEntries, entry]
    }));
  };

  const handleAddItem = (item: Item) => {
    setState(prev => ({
      ...prev,
      items: [...prev.items, item]
    }));
  };

  const handleSyncComplete = (result: { 
    outwards: string[], 
    inwards: string[], 
    vendors: string[], 
    items: string[], 
    works: string[],
    updatedOutwardEntriesWithUrls?: {id: string, url: string}[]
  }) => {
    setState(prev => ({
      ...prev,
      vendors: prev.vendors.map(v => result.vendors.includes(v.id) ? { ...v, synced: true } : v),
      items: prev.items.map(i => result.items.includes(i.id) ? { ...i, synced: true } : i),
      workTypes: prev.workTypes.map(w => result.works.includes(w.id) ? { ...w, synced: true } : w),
      inwardEntries: prev.inwardEntries.map(e => result.inwards.includes(e.id) ? { ...e, synced: true } : e),
      outwardEntries: prev.outwardEntries.map(e => {
        const isSynced = result.outwards.includes(e.id);
        const urlUpdate = result.updatedOutwardEntriesWithUrls?.find(u => u.id === e.id);
        if (urlUpdate) {
           return { ...e, synced: isSynced || e.synced, photoUrl: urlUpdate.url };
        }
        return isSynced ? { ...e, synced: true } : e;
      })
    }));
  };

  const renderContent = () => {
    switch (currentTab) {
      case 'masters':
        return (
          <Masters 
            vendors={state.vendors} setVendors={updateVendors}
            items={state.items} setItems={updateItems}
            workTypes={state.workTypes} setWorkTypes={updateWorkTypes}
          />
        );
      case 'outward':
        return <Outward state={state} onSave={addOutwardEntry} onAddItem={handleAddItem} />;
      case 'inward':
        return <Inward state={state} onSave={addInwardEntry} />;
      case 'recon':
        return <Report state={state} markSynced={handleSyncComplete} />;
      default:
        return <div className="p-4">Page not found</div>;
    }
  };

  const getTitle = () => {
    switch(currentTab) {
      case 'masters': return 'Manage Data';
      case 'outward': return 'Outward Entry';
      case 'inward': return 'Inward Entry';
      case 'recon': return 'Reconciliation Report';
      default: return 'Inventory';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header title={getTitle()} />
      <main className="max-w-5xl mx-auto">
        {renderContent()}
      </main>
      <TabBar currentTab={currentTab} setTab={setCurrentTab} />
    </div>
  );
};

export default App;