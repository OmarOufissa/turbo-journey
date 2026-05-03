import { Button } from "@/components/ui/button";
import { RefreshCw, Upload, Trash2, CheckSquare } from "lucide-react";

interface BatchActionsToolbarProps {
  selectedCount: number;
  onRenew: () => void;
  onUploadPdf: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
  isDeleting?: boolean;
  isRenewing?: boolean;
}

export function BatchActionsToolbar({
  selectedCount,
  onRenew,
  onUploadPdf,
  onDelete,
  onClearSelection,
  isDeleting = false,
  isRenewing = false,
}: BatchActionsToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex gap-3 flex-wrap">
      <Button
        className="gap-2 w-full sm:w-auto"
        onClick={onRenew}
        disabled={isRenewing}
      >
        <RefreshCw className="w-4 h-4" />
        Renouveler ({selectedCount})
      </Button>
      <Button
        variant="outline"
        className="gap-2 w-full sm:w-auto"
        onClick={onUploadPdf}
      >
        <Upload className="w-4 h-4" />
        PDFs ({selectedCount})
      </Button>
      <Button
        variant="destructive"
        className="gap-2 w-full sm:w-auto"
        onClick={onDelete}
        disabled={isDeleting}
      >
        <Trash2 className="w-4 h-4" />
        Supprimer ({selectedCount})
      </Button>
      <Button
        variant="outline"
        className="gap-2 w-full sm:w-auto"
        onClick={onClearSelection}
      >
        <CheckSquare className="w-4 h-4" />
        Désélectionner
      </Button>
    </div>
  );
}
