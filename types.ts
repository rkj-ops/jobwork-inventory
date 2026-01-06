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
  outwardEntries: OutwardEntry[];
  inwardEntries: InwardEntry[];
}

export const SHEETS_CONFIG = {
  spreadsheetId: "14-vN1JG8IVP1QAGUkXBjmFzg8ZfDSfbT63LMc9O7oOA",
  outwardSheetName: "Outward",
  inwardSheetName: "Inward",
  vendorSheetName: "VENDOR MASTER",
  itemSheetName: "ITEM MASTER",
  workSheetName: "WORK MASTER"
};

export const DRIVE_CONFIG = {
  folderId: "1YRTRbcjbj6RReN28fIXK0oanTwW_z8A0"
};