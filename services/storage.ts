import { AppState } from '../types';

const STORAGE_KEY = 'jobwork_app_data_final_v2';

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