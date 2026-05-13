import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Trash2, RefreshCw, FileText, PlusCircle, Download, X } from "lucide-react";
import { BulkAction, BulkProgress } from "@/hooks/useBulkOperations";

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  someSelected: boolean;
  isRunning: boolean;
  progress: BulkProgress | null;
  onToggleAll: () => void;
  onClearSelection: () => void;
  onAction: (action: BulkAction) => void;
  showTrash?: boolean; // true in trash view (restore instead of delete)
}

const ACTION_LABELS: Record<BulkAction, string> = {
  delete: "Supprimer",
  restore: "Restaurer",
  generatePdf: "Générer PDFs",
  addRenewal: "Renouveler",
  export: "Exporter",
};

export function BulkActionBar({
  selectedCount,
  totalCount,
  allSelected,
  someSelected,
  isRunning,
  progress,
  onToggleAll,
  onClearSelection,
  onAction,
  showTrash = false,
}: BulkActionBarProps) {
  if (selectedCount === 0 && !isRunning) return null;

  const progressPct = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border border-primary/20 rounded-xl text-sm">
      {isRunning && progress ? (
        <div className="flex items-center gap-3 flex-1">
          <span className="text-muted-foreground whitespace-nowrap">
            {ACTION_LABELS[progress.action]}… {progress.current}/{progress.total}
          </span>
          <Progress value={progressPct} className="flex-1 h-2" />
          <span className="text-muted-foreground">{progressPct}%</span>
          {progress.errors.length > 0 && (
            <span className="text-destructive">{progress.errors.length} erreur(s)</span>
          )}
        </div>
      ) : (
        <>
          <button
            onClick={onToggleAll}
            className="flex items-center gap-1.5 font-medium text-primary hover:underline"
          >
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected; }}
              onChange={onToggleAll}
              className="accent-primary"
            />
            <span>
              {selectedCount} / {totalCount} sélectionné{selectedCount > 1 ? "s" : ""}
            </span>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            {showTrash ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction("restore")}
                className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Restaurer
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAction("generatePdf")}
                  className="gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  PDFs
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAction("addRenewal")}
                  className="gap-1.5"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Renouveler
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAction("export")}
                  className="gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exporter
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onAction("delete")}
                  className="gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Supprimer
                </Button>
              </>
            )}

            <Button
              size="icon"
              variant="ghost"
              onClick={onClearSelection}
              className="w-7 h-7 text-muted-foreground"
              title="Désélectionner"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
