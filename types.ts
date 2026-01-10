export interface Vendor {
  id: string;
  name: string;
  code: string;
  synced?: boolean;
}

export interface Item {
  id: string;
  sku: string;
  description: string;
  synced?: boolean;
}

export interface WorkType {
  id: string;
  name: string;
  synced?: boolean;
}

export interface User {
  id: string;
  name: string;
  synced?: boolean;
}

export interface OutwardEntry {
  id: string;
  date: string;
  vendorId: string;
  challanNo: string;
  skuId: string;
  qty: number;
  comboQty?: number;
  totalWeight: number;
  pendalWeight: number;
  materialWeight: number;
  workId: string;
  photo?: string;
  photoUrl?: string;
  remarks?: string;
  enteredBy?: string;
  checkedBy?: string;
  status?: 'OPEN' | 'COMPLETED';
  synced?: boolean;
}

export interface InwardEntry {
  id: string;
  date: string;
  outwardChallanId: string;
  vendorId: string;
  skuId: string;
  qty: number;
  comboQty?: number;
  totalWeight: number;
  pendalWeight: number;
  materialWeight: number;
  remarks?: string;
  enteredBy?: string;
  checkedBy?: string;
  photo?: string;
  photoUrl?: string;
  synced?: boolean;
}

export interface AppState {
  vendors: Vendor[];
  items: Item[];
  workTypes: WorkType[];
  users: User[];
  outwardEntries: OutwardEntry[];
  inwardEntries: InwardEntry[];
}

export const SHEETS_CONFIG = {
  spreadsheetId: "14-vN1JG8IVP1QAGUkXBjmFzg8ZfDSfbT63LMc9O7oOA",
  outwardSheetName: "Outward",
  inwardSheetName: "Inward",
  vendorSheetName: "VENDOR MASTER",
  itemSheetName: "ITEM MASTER",
  workSheetName: "WORK MASTER",
  userSheetName: "USER MASTER",
  reconciliationSheetName: "Reconciliation"
};

export const DRIVE_CONFIG = {
  folderId: "1YRTRbcjbj6RReN28fIXK0oanTwW_z8A0"
};

export const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '---';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '---';
    const day = d.getDate().toString().padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return '---';
  }
};