import React, { useState, useEffect, useRef } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedItem = items.find(i => i.id === value);
  const filteredItems = items.filter(i => 
    i.label.toLowerCase().includes(search.toLowerCase()) || 
    i.sublabel?.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
        setTimeout(() => inputRef.current?.focus(), 100);
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <div className="mb-4">
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">{label}</label>
      <div 
        onClick={() => { setIsOpen(true); setSearch(''); }}
        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-all flex justify-between items-center active:bg-slate-200"
      >
        <div className="flex flex-col items-start truncate">
          <span className={selectedItem ? "text-slate-800 font-bold" : "text-slate-400 font-medium"}>
            {selectedItem ? selectedItem.label : (placeholder || 'Select...')}
          </span>
          {selectedItem && selectedItem.sublabel && <span className="text-[10px] text-slate-400 font-bold uppercase">{selectedItem.sublabel}</span>}
        </div>
        <Search size={18} className="text-slate-400 shrink-0 ml-2" />
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in fade-in duration-200">
            <div className="p-4 border-b flex items-center gap-3 bg-white pb-2 pt-safe">
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={24} className="text-slate-500" />
              </button>
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  ref={inputRef}
                  className="w-full pl-10 p-3 bg-slate-100 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-100 font-medium"
                  placeholder={`Search ${label}...`}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 pb-20">
              {filteredItems.length === 0 ? (
                <div className="text-center py-20 px-6">
                   <p className="text-slate-400 italic mb-6">No results for "{search}"</p>
                   {onAddNew && search.length > 1 && (
                      <Button variant="outline" onClick={() => { onAddNew(search); setIsOpen(false); }} className="w-full border-blue-200 text-blue-600 bg-blue-50 py-4">
                         <Plus size={18} className="mr-2"/> Add "{search}" as New
                      </Button>
                   )}
                </div>
              ) : (
                filteredItems.map(item => (
                  <div 
                    key={item.id}
                    onClick={() => { onSelect(item.id); setIsOpen(false); }}
                    className={`p-4 mb-2 rounded-xl cursor-pointer transition-colors border ${value === item.id ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
                  >
                    <div className="font-bold text-base">{item.label}</div>
                    {item.sublabel && <div className={`text-xs uppercase font-bold mt-1 ${value === item.id ? 'text-blue-100' : 'text-slate-400'}`}>{item.sublabel}</div>}
                  </div>
                ))
              )}
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
    <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200 px-2 pb-safe pt-2 flex justify-around shadow-lg z-[90]">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setTab(tab.id)}
          className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 w-full ${currentTab === tab.id ? 'text-blue-600 bg-blue-50' : 'text-slate-400 active:text-slate-600'}`}
        >
          <span className="text-2xl mb-0.5 leading-none filter drop-shadow-sm">{tab.icon}</span>
          <span className="text-[10px] font-black uppercase tracking-tight">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

export const Header: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-40 pt-safe">
    <div className="flex justify-between items-center max-w-5xl mx-auto h-10">
      <h1 className="text-xl font-black text-slate-800 tracking-tight">{title}</h1>
      {action}
    </div>
  </header>
);
