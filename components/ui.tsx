import React, { useState } from 'react';
import { Search, Plus, X } from 'lucide-react';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'outline' }> = ({ className = '', variant = 'primary', ...props }) => {
  const baseStyle = "px-6 py-3 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed w-full shadow-sm";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "bg-red-500 text-white hover:bg-red-600",
    outline: "border-2 border-slate-200 text-slate-600 hover:bg-slate-50"
  };
  
  return <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props} />;
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, className = '', ...props }) => (
  <div className="mb-4">
    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">{label}</label>
    <input className={`w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all ${className}`} {...props} />
  </div>
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }> = ({ label, children, className = '', ...props }) => (
  <div className="mb-4">
    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">{label}</label>
    <select className={`w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none appearance-none transition-all ${className}`} {...props}>
      {children}
    </select>
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; title?: string; className?: string }> = ({ children, title, className = '' }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-5 ${className}`}>
    {title && <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 pb-2 border-b border-slate-50">{title}</h3>}
    {children}
  </div>
);

export const SearchableList: React.FC<{
  label: string;
  items: { id: string; label: string; sublabel?: string }[];
  placeholder?: string;
  onSelect: (id: string) => void;
  onAddNew?: (search: string) => void;
  value?: string;
}> = ({ label, items, placeholder, onSelect, onAddNew, value }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedItem = items.find(i => i.id === value);
  const filteredItems = items.filter(i => 
    i.label.toLowerCase().includes(search.toLowerCase()) || 
    i.sublabel?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mb-4">
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">{label}</label>
      <div 
        onClick={() => setIsOpen(true)}
        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-all flex justify-between items-center"
      >
        <span className={selectedItem ? "text-slate-800 font-bold" : "text-slate-400"}>
          {selectedItem ? selectedItem.label : (placeholder || 'Select...')}
        </span>
        <Search size={18} className="text-slate-400" />
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-slate-700">Search {label}</h3>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-slate-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                <input 
                  autoFocus
                  className="w-full pl-10 p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder={`Type to search ${label.toLowerCase()}...`}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {filteredItems.length === 0 ? (
                <div className="text-center py-10">
                   <p className="text-slate-400 italic mb-4">No results for "{search}"</p>
                   {onAddNew && (
                      <Button variant="outline" onClick={() => { onAddNew(search); setIsOpen(false); }} className="w-auto mx-auto border-blue-200 text-blue-600">
                         <Plus size={16} className="mr-2"/> Add "{search}" as new
                      </Button>
                   )}
                </div>
              ) : (
                filteredItems.map(item => (
                  <div 
                    key={item.id}
                    onClick={() => { onSelect(item.id); setIsOpen(false); }}
                    className={`p-3.5 mb-1 rounded-xl cursor-pointer transition-colors ${value === item.id ? 'bg-blue-600 text-white' : 'hover:bg-slate-50'}`}
                  >
                    <div className="font-bold">{item.label}</div>
                    {item.sublabel && <div className={`text-[10px] uppercase font-black ${value === item.id ? 'text-blue-100' : 'text-slate-400'}`}>{item.sublabel}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const TabBar: React.FC<{ currentTab: string; setTab: (t: string) => void }> = ({ currentTab, setTab }) => {
  const tabs = [
    { id: 'outward', label: 'Outward', icon: '📤' },
    { id: 'inward', label: 'Inward', icon: '📥' },
    { id: 'recon', label: 'Report', icon: '📊' },
    { id: 'masters', label: 'Setup', icon: '⚙️' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-slate-100 px-3 pb-safe pt-2 flex justify-around shadow-[0_-8px_30px_rgb(0,0,0,0.04)] z-50">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setTab(tab.id)}
          className={`flex flex-col items-center justify-center p-2 rounded-2xl transition-all duration-300 w-full ${currentTab === tab.id ? 'text-blue-600 bg-blue-50/50 scale-105' : 'text-slate-400'}`}
        >
          <span className="text-xl mb-1">{tab.icon}</span>
          <span className="text-[10px] font-bold uppercase tracking-tighter">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

export const Header: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <header className="bg-white border-b border-slate-100 p-4 sticky top-0 z-40">
    <div className="flex justify-between items-center max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-slate-800 tracking-tight">{title}</h1>
      {action}
    </div>
  </header>
);
