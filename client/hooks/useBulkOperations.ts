/**
 * Bulk operations hook — V4 schema.
 * Manages checkbox selection, select-all, and bulk actions with progress tracking.
 */

import { useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "./use-toast";
import { Employee } from "@/types";

export type BulkAction = "delete" | "restore" | "generatePdf" | "addRenewal" | "export";

export interface BulkProgress {
  current: number;
  total: number;
  action: BulkAction;
  errors: string[];
}

const API_BASE = "/api";
const getToken = () => localStorage.getItem("token") ?? "";

async function apiCall(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? json.message ?? "Erreur réseau");
  return json;
}

export function useBulkOperations(employees: Employee[]) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const availableIds = useMemo(() => employees.map((e) => e.id), [employees]);
  const allSelected = availableIds.length > 0 && availableIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;
  const hasSelection = selectedIds.size > 0;

  const toggleOne = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(availableIds));
  }, [availableIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) clearSelection();
    else selectAll();
  }, [allSelected, clearSelection, selectAll]);

  const selectedEmployees = useMemo(
    () => employees.filter((e) => selectedIds.has(e.id)),
    [employees, selectedIds]
  );

  async function runBulkAction(action: BulkAction): Promise<void> {
    if (isRunning || !hasSelection) return;

    const ids = Array.from(selectedIds);
    setIsRunning(true);
    setProgress({ current: 0, total: ids.length, action, errors: [] });

    const errors: string[] = [];
    let successCount = 0;

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const emp = employees.find((e) => e.id === id);
      setProgress({ current: i, total: ids.length, action, errors: [...errors] });

      try {
        switch (action) {
          case "delete":
            await apiCall("DELETE", `/employees/${id}`);
            break;
          case "restore":
            await apiCall("POST", `/employees/${id}/restore`);
            break;
          case "generatePdf":
            await apiCall("POST", `/employees/${id}/generate-pdf`);
            break;
          case "addRenewal":
            if (emp?.currentVersion) {
              await apiCall("POST", "/renewals", {
                employeeId: id,
                snapshot: emp.currentVersion,
              });
            }
            break;
          case "export":
            // Export is handled client-side via exportToExcel, not per-request
            break;
        }
        successCount++;
      } catch (err: any) {
        errors.push(`${emp?.matricule ?? id}: ${err.message}`);
      }
    }

    setProgress({ current: ids.length, total: ids.length, action, errors });
    setIsRunning(false);

    // Invalidate queries
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: ["renewals"] });

    const actionLabels: Record<BulkAction, string> = {
      delete: "supprimé(s)",
      restore: "restauré(s)",
      generatePdf: "PDF généré(s)",
      addRenewal: "renouvellement(s) créé(s)",
      export: "exporté(s)",
    };

    if (errors.length === 0) {
      toast({
        title: `${successCount} employé(s) ${actionLabels[action]}`,
        description: "Opération en masse terminée",
      });
    } else {
      toast({
        title: `${successCount} réussi(s), ${errors.length} erreur(s)`,
        description: errors.slice(0, 3).join("; ") + (errors.length > 3 ? "…" : ""),
        variant: "destructive",
      });
    }

    if (errors.length === 0) clearSelection();
  }

  return {
    selectedIds,
    selectedEmployees,
    hasSelection,
    allSelected,
    someSelected,
    toggleOne,
    toggleAll,
    selectAll,
    clearSelection,
    progress,
    isRunning,
    runBulkAction,
  };
}
