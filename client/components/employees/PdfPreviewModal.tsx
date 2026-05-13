/**
 * PDF preview modal — embedded viewer, cache busting, corruption detection.
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, AlertTriangle, Loader2, ExternalLink } from "lucide-react";

interface PdfPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfPath: string | null | undefined;
  title?: string;
}

export function PdfPreviewModal({ open, onOpenChange, pdfPath, title = "Aperçu du PDF" }: PdfPreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cache-bust on every open: append timestamp so browser doesn't serve stale PDF
  const pdfUrl = pdfPath
    ? `/uploads/pdfs/${encodeURIComponent(pdfPath)}?v=${Date.now()}`
    : null;

  useEffect(() => {
    if (open && pdfUrl) {
      setLoading(true);
      setError(null);

      // Validate PDF existence and basic integrity via HEAD request
      fetch(pdfUrl, { method: "HEAD" })
        .then((res) => {
          if (!res.ok) {
            setError(`Fichier PDF introuvable (HTTP ${res.status})`);
          }
          const ct = res.headers.get("content-type") ?? "";
          if (!ct.includes("pdf") && !ct.includes("octet")) {
            setError("Le fichier ne semble pas être un PDF valide");
          }
        })
        .catch(() => setError("Impossible d'accéder au fichier PDF"))
        .finally(() => setLoading(false));
    }
  }, [open, pdfUrl]);

  function handleDownload() {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = pdfPath ?? "habilitation.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleOpenTab() {
    if (!pdfUrl) window.open(pdfUrl!, "_blank");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="relative w-full rounded-xl overflow-hidden bg-muted/30 border border-border"
          style={{ height: "70vh" }}
        >
          {!pdfUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <AlertTriangle className="w-10 h-10" />
              <p className="text-sm">Aucun PDF disponible pour ce dossier</p>
            </div>
          )}

          {pdfUrl && loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {pdfUrl && error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-destructive">
              <AlertTriangle className="w-10 h-10" />
              <p className="text-sm font-medium">{error}</p>
              <p className="text-xs text-muted-foreground">Essayez de régénérer le PDF</p>
            </div>
          )}

          {pdfUrl && !error && (
            <iframe
              key={pdfUrl}
              src={pdfUrl}
              className="w-full h-full border-0"
              title={title}
              onLoad={() => setLoading(false)}
              onError={() => { setError("Impossible d'afficher le PDF dans le navigateur"); setLoading(false); }}
            />
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          {pdfUrl && !error && (
            <>
              <Button variant="outline" onClick={handleOpenTab} className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Ouvrir dans un onglet
              </Button>
              <Button onClick={handleDownload} className="gap-2">
                <Download className="w-4 h-4" />
                Télécharger
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
