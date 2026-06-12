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
  onConfirm: (validationDate: string, expirationDate: string) => void;
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
  const [expirationDate, setExpirationDate] = useState("");

  const isValid =
    validationDate && expirationDate && expirationDate > validationDate;

  const handleConfirm = () => {
    if (isValid) {
      onConfirm(validationDate, expirationDate);
      setValidationDate("");
      setExpirationDate("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Renouveler les habilitations sélectionnées</DialogTitle>
          <DialogDescription>
            Sélectionnez les nouvelles dates de validation et d'expiration pour {selectedCount}{" "}
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
          <div className="space-y-2">
            <Label htmlFor="batch-expiration-date">
              Nouvelle date d'expiration *
            </Label>
            <Input
              id="batch-expiration-date"
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
            />
            {validationDate && expirationDate && expirationDate <= validationDate && (
              <p className="text-sm text-destructive">
                La date d'expiration doit être postérieure à la date de validation
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setValidationDate("");
              setExpirationDate("");
            }}
          >
            Annuler
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isRenewing || !isValid}
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
