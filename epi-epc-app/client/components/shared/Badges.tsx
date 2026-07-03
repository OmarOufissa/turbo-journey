import { Badge } from "@/components/ui/badge";

export function StockBadge({ disponible, min }: { disponible: number; min: number }) {
  if (disponible === 0) return <Badge variant="destructive">Rupture</Badge>;
  if (disponible <= min) return <Badge variant="warning">Stock faible</Badge>;
  return <Badge variant="success">Normal</Badge>;
}

const STATUT_AFFECTATION: Record<string, { label: string; variant: "success" | "muted" | "destructive" | "warning" }> = {
  actif: { label: "Actif", variant: "success" },
  retourne: { label: "Retourné", variant: "muted" },
  perdu: { label: "Perdu", variant: "destructive" },
  reforme: { label: "Réformé", variant: "warning" },
};
export function StatutAffectationBadge({ statut }: { statut: string }) {
  const cfg = STATUT_AFFECTATION[statut] ?? { label: statut, variant: "muted" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

const NIVEAU_ALERTE: Record<string, { label: string; variant: "destructive" | "warning" | "muted" }> = {
  critical: { label: "Critique", variant: "destructive" },
  warning: { label: "Attention", variant: "warning" },
  info: { label: "Info", variant: "muted" },
};
export function NiveauAlerteBadge({ niveau }: { niveau: string }) {
  const cfg = NIVEAU_ALERTE[niveau] ?? { label: niveau, variant: "muted" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

const STATUT_CONTROLE: Record<string, { label: string; variant: "success" | "destructive" | "warning" | "muted" }> = {
  planifie: { label: "Planifié", variant: "muted" },
  realise: { label: "Réalisé", variant: "success" },
  en_retard: { label: "En retard", variant: "destructive" },
  annule: { label: "Annulé", variant: "muted" },
};
export function StatutControleBadge({ statut }: { statut: string }) {
  const cfg = STATUT_CONTROLE[statut] ?? { label: statut, variant: "muted" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
