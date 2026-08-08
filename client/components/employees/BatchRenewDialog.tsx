import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw } from "lucide-react";

interface BatchRenewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onConfirm: (validationDate: string) => void;
  isRenewing?: boolean;
}

export function BatchRenewDialog({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
  isRenewing = false,
}: BatchRenewDialogProps) {
  const [validationDate, setValidationDate] = useState("");

  const handleConfirm = () => {
    if (validationDate) {
      onConfirm(validationDate);
      setValidationDate("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Renouveler les habilitations sélectionnées</DialogTitle>
          <DialogDescription>
            Sélectionnez une nouvelle date de validation pour {selectedCount}{" "}
            habilitation(s)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="batch-renewal-date">
              Nouvelle date de validation *
            </Label>
            <Input
              id="batch-renewal-date"
              type="date"
              value={validationDate}
              onChange={(e) => setValidationDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setValidationDate("");
            }}
          >
            Annuler
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isRenewing || !validationDate}
          >
            {isRenewing ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Renouvellement...
              </span>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Renouveler
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
