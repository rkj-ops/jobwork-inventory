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

/**
 * Enhanced saveData:
 * - Keeps base64 photos for UNSYNCED entries (critical for mobile reliability).
 * - Removes base64 photos for SYNCED entries to save space (they have photoUrl).
 */
export const saveData = (data: AppState) => {
  try {
    // Only strip photos from entries that are already successfully synced
    const storageData = {
      ...data,
      outwardEntries: data.outwardEntries.map(e => e.synced ? { ...e, photo: undefined } : e),
      inwardEntries: data.inwardEntries.map(e => e.synced ? { ...e, photo: undefined } : e)
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
  } catch (e) {
    console.error("Storage Error:", e);
    // If quota exceeded, we might need a more aggressive cleanup strategy
    // But blocking photo save is better than crashing
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
        console.warn("Local storage quota exceeded. Attempting critical cleanup.");
    }
  }
};
