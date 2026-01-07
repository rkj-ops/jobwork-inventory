import { AppState } from '../types';

const STORAGE_KEY = 'jobwork_app_data_final_v2';

const initialData: AppState = {
  vendors: [],
  items: [],
  workTypes: [],
  users: [],
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Storage Error: Quota Exceeded or Invalid Data", e);
    // Alert the user only if it's likely a quota error (usually DOMException code 22)
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
        alert("⚠️ Local Storage Full! Your images are too large to save locally.\n\nPlease click 'Sync' to upload data to Google Sheets and clear local space.");
    }
  }
};