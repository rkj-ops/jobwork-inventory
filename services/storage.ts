import { AppState, Vendor, Item, WorkType, OutwardEntry, InwardEntry } from '../types';

const STORAGE_KEY = 'jobwork_app_data';

const initialData: AppState = {
  vendors: [],
  items: [],
  workTypes: [],
  outwardEntries: [],
  inwardEntries: [],
};

export const loadData = (): AppState => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return { ...initialData, ...parsed };
    } catch (e) {
      console.error("Failed to load data", e);
      return initialData;
    }
  }
  return initialData;
};

export const saveData = (data: AppState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

// Helper to generate CSV for Google Sheets manual upload (Fall back)
export const generateCSV = (data: OutwardEntry[] | InwardEntry[], type: 'OUTWARD' | 'INWARD', vendors: Vendor[], items: Item[], workTypes: WorkType[]) => {
  const headers = type === 'OUTWARD' 
    ? ['Date', 'Vendor', 'Challan No', 'SKU', 'Qty', 'Total Wt', 'Pendal Wt', 'Mat Wt', 'Work', 'Remarks']
    : ['Date', 'Outward Challan', 'SKU', 'Qty', 'Total Wt', 'Pendal Wt', 'Mat Wt', 'Remarks'];

  const rows = data.map(entry => {
    const vendor = vendors.find(v => v.id === entry.vendorId)?.name || 'Unknown';
    const sku = items.find(i => i.id === entry.skuId)?.sku || 'Unknown';
    
    if (type === 'OUTWARD') {
      const e = entry as OutwardEntry;
      const work = workTypes.find(w => w.id === e.workId)?.name || '-';
      return [
        e.date.split('T')[0],
        vendor,
        e.challanNo,
        sku,
        e.qty,
        e.totalWeight,
        e.pendalWeight,
        e.materialWeight,
        work,
        e.remarks || ''
      ].join(',');
    } else {
      const e = entry as InwardEntry;
      // Find related outward challan number for display
      // We assume the caller might pass joined data, but here we keep it simple
      return [
        e.date.split('T')[0],
        e.outwardChallanId, // This is the ID, ideally should be the challan No string passed in
        sku,
        e.qty,
        e.totalWeight,
        e.pendalWeight,
        e.materialWeight,
        e.remarks || ''
      ].join(',');
    }
  });

  return [headers.join(','), ...rows].join('\n');
};