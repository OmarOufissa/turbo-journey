import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  batchDeleteHabilitations,
  batchUpdateHabilitations,
  batchUploadPdfs,
} from "@/api";
import { useToast } from "./use-toast";

export function useBatchOperations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedHT, setSelectedHT] = useState<Set<number>>(new Set());
  const [selectedST, setSelectedST] = useState<Set<number>>(new Set());

  const selectedIds = Array.from(selectedHT).concat(Array.from(selectedST));
  const hasSelection = selectedIds.length > 0;

  const batchDeleteMutation = useMutation({
    mutationFn: (habilitationIds: number[]) =>
      batchDeleteHabilitations({ habilitationIds }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({
        title: "Habilitations supprimées",
        description: `${data.deleted} habilitation(s) supprimée(s) avec succès`,
      });
      clearSelection();
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const batchRenewMutation = useMutation({
    mutationFn: ({
      habilitationIds,
      date_validation,
    }: {
      habilitationIds: number[];
      date_validation: string;
    }) =>
      batchUpdateHabilitations({
        habilitationIds,
        codes: [],
        date_validation,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({
        title: "Habilitations renouvelées",
        description: `${data.updated} habilitation(s) renouvelée(s) avec succès`,
      });
      clearSelection();
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const batchPdfMutation = useMutation({
    mutationFn: ({
      habilitationIds,
      files,
    }: {
      habilitationIds: number[];
      files: File[];
    }) => batchUploadPdfs(habilitationIds, files),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({
        title: "PDFs téléchargés",
        description: `${data.uploaded} fichier(s) téléchargé(s) avec succès`,
      });
      clearSelection();
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearSelection = () => {
    setSelectedHT(new Set());
    setSelectedST(new Set());
  };

  const toggleHT = (id: number) => {
    const newSet = new Set(selectedHT);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedHT(newSet);
  };

  const toggleST = (id: number) => {
    const newSet = new Set(selectedST);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedST(newSet);
  };

  const selectAllHT = (ids: number[]) => {
    setSelectedHT(new Set(ids));
  };

  const selectAllST = (ids: number[]) => {
    setSelectedST(new Set(ids));
  };

  const deselectAllHT = () => {
    setSelectedHT(new Set());
  };

  const deselectAllST = () => {
    setSelectedST(new Set());
  };

  return {
    selectedHT,
    selectedST,
    selectedIds,
    hasSelection,
    toggleHT,
    toggleST,
    selectAllHT,
    selectAllST,
    deselectAllHT,
    deselectAllST,
    clearSelection,
    batchDelete: batchDeleteMutation.mutate,
    isDeleting: batchDeleteMutation.isPending,
    batchRenew: batchRenewMutation.mutate,
    isRenewing: batchRenewMutation.isPending,
    batchUploadPdf: batchPdfMutation.mutate,
    isUploadingPdf: batchPdfMutation.isPending,
  };
}
