import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Trash2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface PDFUploadProps {
  habilitationId: number;
  type: "HT" | "ST";
  currentPdfPath?: string;
  onUploadComplete: () => void;
}

export function PDFUpload({
  habilitationId,
  type,
  currentPdfPath,
  onUploadComplete,
}: PDFUploadProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(currentPdfPath);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({
        title: "Erreur",
        description: "Veuillez sélectionner un fichier PDF",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("pdf", file);
      formData.append("habilitationId", habilitationId.toString());

      const response = await fetch("/api/habilitations/upload-pdf", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      setPdfUrl(data.pdfPath);

      toast({
        title: "PDF téléchargé",
        description: "Le fichier a été téléchargé avec succès",
      });

      onUploadComplete();
    } catch (err) {
      toast({
        title: "Erreur",
        description: "Échec du téléchargement du PDF",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce PDF ?")) return;

    try {
      const response = await fetch(`/api/habilitations/${habilitationId}/pdf`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      setPdfUrl(undefined);
      toast({
        title: "PDF supprimé",
        description: "Le fichier a été supprimé avec succès",
      });

      onUploadComplete();
    } catch (err) {
      toast({
        title: "Erreur",
        description: "Échec de la suppression du PDF",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="flex items-center gap-2">
      {pdfUrl ? (
        <>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="neon-border">
                <Eye className="w-4 h-4 mr-2" />
                Voir PDF
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Document PDF - Habilitation {type}</DialogTitle>
                <DialogDescription>
                  Fichier de l'habilitation
                </DialogDescription>
              </DialogHeader>
              <div className="w-full h-[70vh] overflow-auto">
                <iframe
                  src={pdfUrl}
                  className="w-full h-full border rounded"
                  title={`PDF ${type}`}
                />
              </div>
            </DialogContent>
          </Dialog>

          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </>
      ) : (
        <>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="hidden"
            id={`pdf-upload-${habilitationId}`}
            disabled={uploading}
          />
          <label htmlFor={`pdf-upload-${habilitationId}`}>
            <Button
              variant="outline"
              size="sm"
              disabled={uploading}
              className="electric-button cursor-pointer"
              asChild
            >
              <span>
                {uploading ? (
                  "Téléchargement..."
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Télécharger PDF {type}
                  </>
                )}
              </span>
            </Button>
          </label>
        </>
      )}
    </div>
  );
}
