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
 * Enhanced saveData that filters out raw base64 photos before persisting to localStorage.
 * Base64 images are too large for the 5MB localStorage limit. 
 * They are kept in memory state for syncing, but not saved to disk.
 */
export const saveData = (data: AppState) => {
  try {
    // Deep clone and clean the data for storage
    const storageData = {
      ...data,
      outwardEntries: data.outwardEntries.map(({ photo, ...rest }) => rest),
      inwardEntries: data.inwardEntries.map(({ photo, ...rest }) => rest)
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
  } catch (e) {
    console.error("Storage Error:", e);
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
        // This shouldn't happen now with the photo filtering, but kept as a fallback
        console.warn("Local storage quota exceeded even after filtering.");
    }
  }
};
