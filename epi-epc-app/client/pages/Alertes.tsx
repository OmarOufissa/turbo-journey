import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { CheckCheck, Bell, AlertTriangle, Ban, Info, Package, Wrench, CalendarClock, Truck } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NiveauAlerteBadge } from "@/components/shared/Badges";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";

interface Alerte {
  id: number;
  type: string;
  niveau: string;
  message: string;
  lue: boolean;
  traitee: boolean;
  createdAt: string;
}

const TYPE_ICON: Record<string, typeof Bell> = {
  stock_faible: AlertTriangle,
  rupture: Ban,
  fin_de_vie: Package,
  controle_a_faire: Wrench,
  inspection: Wrench,
  etalonnage: Wrench,
  garantie_expiree: CalendarClock,
  livraison_attendue: Truck,
};

export default function Alertes() {
  const qc = useQueryClient();
  const [niveau, setNiveau] = useState("all");
  const [onlyUnread, setOnlyUnread] = useState(true);

  const { data, isLoading } = useQuery<Alerte[]>({
    queryKey: ["alertes-page", niveau, onlyUnread],
    queryFn: () => apiGet(`/alertes?${onlyUnread ? "lue=false&" : ""}${niveau !== "all" ? `niveau=${niveau}` : ""}`),
  });

  const marquerLue = useMutation({
    mutationFn: (id: number) => apiPost(`/alertes/${id}/lue`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alertes-page"] });
      qc.invalidateQueries({ queryKey: ["alertes"] });
    },
  });
  const marquerTraitee = useMutation({
    mutationFn: (id: number) => apiPost(`/alertes/${id}/traitee`),
    onSuccess: () => {
      toast.success("Alerte traitée");
      qc.invalidateQueries({ queryKey: ["alertes-page"] });
      qc.invalidateQueries({ queryKey: ["alertes"] });
    },
  });
  const toutMarquer = useMutation({
    mutationFn: () => apiPost("/alertes/tout-marquer-lu"),
    onSuccess: () => {
      toast.success("Toutes les alertes ont été marquées comme lues");
      qc.invalidateQueries({ queryKey: ["alertes-page"] });
      qc.invalidateQueries({ queryKey: ["alertes"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Alertes</h1>
          <p className="text-sm text-muted-foreground">Stock, contrôles, fins de vie et livraisons attendues</p>
        </div>
        <Button variant="outline" onClick={() => toutMarquer.mutate()}><CheckCheck className="h-4 w-4" /> Tout marquer comme lu</Button>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap gap-2">
          <Select value={niveau} onValueChange={setNiveau}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Niveau" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous niveaux</SelectItem>
              <SelectItem value="critical">Critique</SelectItem>
              <SelectItem value="warning">Attention</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Button variant={onlyUnread ? "default" : "outline"} size="sm" onClick={() => setOnlyUnread((v) => !v)}>
            Non lues uniquement
          </Button>
        </div>
      </Card>

      <div className="space-y-2">
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>}
        {!isLoading && data?.length === 0 && (
          <Card className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Info className="h-6 w-6" />
            <p className="text-sm">Aucune alerte pour ces filtres</p>
          </Card>
        )}
        {data?.map((a) => {
          const Icon = TYPE_ICON[a.type] ?? Bell;
          return (
            <Card key={a.id} className={cn("flex items-center gap-3 p-3.5", !a.lue && "border-primary/30 bg-primary/5")}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-4.5 w-4.5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{a.message}</p>
                <p className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</p>
              </div>
              <NiveauAlerteBadge niveau={a.niveau} />
              <div className="flex gap-1">
                {!a.lue && <Button size="sm" variant="ghost" onClick={() => marquerLue.mutate(a.id)}>Lu</Button>}
                {!a.traitee && <Button size="sm" variant="ghost" onClick={() => marquerTraitee.mutate(a.id)}>Traiter</Button>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
