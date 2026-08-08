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
import { Upload } from "lucide-react";

interface BatchPdfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onConfirm: (files: File[]) => void;
  isUploading?: boolean;
}

export function BatchPdfDialog({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
  isUploading = false,
}: BatchPdfDialogProps) {
  const [files, setFiles] = useState<File[]>([]);

  const handleConfirm = () => {
    if (files.length > 0) {
      onConfirm(files);
      setFiles([]);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Télécharger les PDFs</DialogTitle>
          <DialogDescription>
            Sélectionnez les fichiers PDF pour les {selectedCount}{" "}
            habilitation(s)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="batch-pdf-files">
              Fichiers PDF (jusqu'à {selectedCount} fichiers)
            </Label>
            <Input
              id="batch-pdf-files"
              type="file"
              accept=".pdf"
              multiple
              onChange={(e) => {
                const fileList = Array.from(e.target.files || []);
                setFiles(fileList);
              }}
            />
            {files.length > 0 && (
              <div className="text-sm text-muted-foreground">
                {files.length} fichier(s) sélectionné(s)
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Les PDFs seront associés aux habilitations sélectionnées dans
            l'ordre.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setFiles([]);
            }}
          >
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={isUploading || files.length === 0}>
            {isUploading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Téléchargement...
              </span>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Télécharger
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
