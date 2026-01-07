import React from 'react';
import { AppState, OutwardEntry } from '../types';
import { X } from 'lucide-react';

interface PrintChallanProps {
  entry: OutwardEntry;
  state: AppState;
  onClose: () => void;
}

const PrintChallan: React.FC<PrintChallanProps> = ({ entry, state, onClose }) => {
  const vendor = state.vendors.find(v => v.id === entry.vendorId);
  const item = state.items.find(i => i.id === entry.skuId);
  const work = state.workTypes.find(w => w.id === entry.workId);

  return (
    <div id="print-area" className="flex flex-col h-full bg-white text-black p-8 font-serif fixed inset-0 z-[100] overflow-auto">
      <div className="text-center border-b-2 border-black pb-4 mb-4">
        <h1 className="text-4xl font-bold mb-1">RKJ RAKHI</h1>
        <p className="text-sm font-bold tracking-widest uppercase">Ahmedabad, Gujarat</p>
        <h2 className="text-xl font-bold mt-4 uppercase border px-4 py-1 inline-block border-black">Job Work Challan</h2>
      </div>

      <div className="flex justify-between mb-6 text-sm">
        <div>
          <p><strong>Vendor:</strong> {vendor?.name} ({vendor?.code})</p>
        </div>
        <div className="text-right">
          <p><strong>Challan No:</strong> {entry.challanNo}</p>
          <p><strong>Date:</strong> {new Date(entry.date).toLocaleDateString()}</p>
          <p><strong>Work:</strong> {work?.name}</p>
        </div>
      </div>

      <table className="w-full border-collapse border border-black mb-8 text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-2">SKU</th>
            <th className="border border-black p-2">Qty</th>
            <th className="border border-black p-2">Combo</th>
            <th className="border border-black p-2">Total Wt</th>
            <th className="border border-black p-2">Pendal Wt</th>
            <th className="border border-black p-2">Net Mat. Wt</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black p-4 text-center">{item?.sku}</td>
            <td className="border border-black p-4 text-center font-bold">{entry.qty}</td>
            <td className="border border-black p-4 text-center">{entry.comboQty || '-'}</td>
            <td className="border border-black p-4 text-center">{entry.totalWeight}</td>
            <td className="border border-black p-4 text-center">{entry.pendalWeight}</td>
            <td className="border border-black p-4 text-center font-bold">{entry.materialWeight}</td>
          </tr>
        </tbody>
      </table>

      <div className="mb-8">
        <p className="font-bold text-xs uppercase mb-1">Remarks</p>
        <p className="border-b border-dotted border-black p-2 min-h-[40px]">{entry.remarks || ''}</p>
      </div>

      <div className="grid grid-cols-3 gap-8 mt-auto pt-16 text-xs font-bold uppercase text-center">
        <div className="border-t border-black pt-2">
           <div className="mb-1">Entered By</div>
           <div className="font-normal normal-case">{entry.enteredBy || 'Admin'}</div>
        </div>
        <div className="border-t border-black pt-2">
           <div className="mb-1">Checked By</div>
           <div className="font-normal normal-case">{entry.checkedBy || '-'}</div>
        </div>
        <div className="border-t border-black pt-2">Vendor Signature</div>
      </div>

      <button onClick={onClose} className="no-print fixed top-4 right-4 bg-red-600 text-white p-2 rounded-full shadow-lg hover:bg-red-700 z-50">
        <X size={24} />
      </button>
    </div>
  );
};

export default PrintChallan;