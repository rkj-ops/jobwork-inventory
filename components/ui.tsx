import React from 'react';

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