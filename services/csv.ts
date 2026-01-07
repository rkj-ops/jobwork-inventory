import { AppState, Vendor, Item, WorkType, OutwardEntry, InwardEntry } from '../types';
import { v4 as uuidv4 } from 'uuid';

export const exportToCSV = (data: any[], filename: string) => {
  if (!data.length) return;
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(obj => 
    Object.values(obj).map(val => 
      typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val
    ).join(',')
  );
  const csvContent = [headers, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const parseCSV = (content: string): any[] => {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  return lines.slice(1).map(line => {
    // Handle quotes in CSV
    const values: string[] = [];
    let inQuote = false;
    let currentVal = '';
    for(let i=0; i<line.length; i++) {
      const char = line[i];
      if(char === '"') { inQuote = !inQuote; }
      else if(char === ',' && !inQuote) { values.push(currentVal); currentVal = ''; }
      else { currentVal += char; }
    }
    values.push(currentVal);

    const obj: any = {};
    headers.forEach((h, i) => {
      let val = values[i]?.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
      if (val === 'true') obj[h] = true;
      else if (val === 'false') obj[h] = false;
      else if (!isNaN(Number(val)) && val !== '') obj[h] = Number(val);
      else obj[h] = val;
    });
    return obj;
  });
};