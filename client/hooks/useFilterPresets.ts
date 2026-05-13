/**
 * Filter presets — save/rename/delete/apply current filters via localStorage.
 */

import { useState, useCallback, useEffect } from "react";

export interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: string;
}

const STORAGE_KEY = "employee_filter_presets";

function loadPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FilterPreset[]) : [];
  } catch {
    return [];
  }
}

function savePresetsToStorage(presets: FilterPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch { /* ignore quota errors */ }
}

export function useFilterPresets() {
  const [presets, setPresets] = useState<FilterPreset[]>(loadPresets);

  // Keep storage in sync
  useEffect(() => {
    savePresetsToStorage(presets);
  }, [presets]);

  const savePreset = useCallback((name: string, filters: Record<string, unknown>) => {
    if (!name.trim()) return;
    const preset: FilterPreset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: name.trim(),
      filters,
      createdAt: new Date().toISOString(),
    };
    setPresets((prev) => [...prev, preset]);
    return preset;
  }, []);

  const renamePreset = useCallback((id: string, newName: string) => {
    if (!newName.trim()) return;
    setPresets((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: newName.trim() } : p))
    );
  }, []);

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const getPreset = useCallback(
    (id: string): FilterPreset | undefined => presets.find((p) => p.id === id),
    [presets]
  );

  return { presets, savePreset, renamePreset, deletePreset, getPreset };
}
