import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Plus, Trash2, Briefcase, Factory, Zap, FileText } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface RefItem { id: number; name: string; }

const token = () => localStorage.getItem("token") ?? "";

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(opts?.headers ?? {}) } });
  return res.json();
}

type RefType = "fonctions" | "ouvrages" | "domaines" | "indications";

export default function RefDataSettings() {
  const { toast } = useToast();
  const [fonctions, setFonctions] = useState<RefItem[]>([]);
  const [ouvrages, setOuvrages] = useState<RefItem[]>([]);
  const [domaines, setDomaines] = useState<RefItem[]>([]);
  const [indications, setIndications] = useState<RefItem[]>([]);

  const [newFonction, setNewFonction] = useState("");
  const [newOuvrage, setNewOuvrage] = useState("");
  const [newDomaine, setNewDomaine] = useState("");
  const [newIndication, setNewIndication] = useState("");

  const [pendingDelete, setPendingDelete] = useState<{ type: RefType; id: number; name: string } | null>(null);

  const load = async () => {
    const [f, o, d, i] = await Promise.all([
      apiFetch("/api/ref/fonctions"),
      apiFetch("/api/ref/ouvrages"),
      apiFetch("/api/ref/domaines"),
      apiFetch("/api/ref/indications"),
    ]);
    if (f.success) setFonctions(f.data);
    if (o.success) setOuvrages(o.data);
    if (d.success) setDomaines(d.data);
    if (i.success) setIndications(i.data);
  };

  useEffect(() => { load(); }, []);

  const addItem = async (type: RefType, name: string, resetFn: (v: string) => void) => {
    if (!name.trim()) return;
    const labels: Record<RefType, string> = { fonctions: "Fonction", ouvrages: "Ouvrage", domaines: "Domaine", indications: "Indication" };
    const r = await apiFetch(`/api/ref/${type}`, { method: "POST", body: JSON.stringify({ name: name.trim() }) });
    if (r.success) { resetFn(""); load(); toast({ title: `${labels[type]} créé(e)` }); }
    else toast({ title: "Erreur", description: r.error, variant: "destructive" });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    const labels: Record<RefType, string> = { fonctions: "Fonction", ouvrages: "Ouvrage", domaines: "Domaine", indications: "Indication" };
    const r = await apiFetch(`/api/ref/${type}/${id}`, { method: "DELETE" });
    if (r.success) { load(); toast({ title: `${labels[type]} supprimé(e)` }); }
    else toast({ title: "Erreur", description: r.error, variant: "destructive" });
  };

  const renderCard = (
    title: string,
    icon: React.ReactNode,
    items: RefItem[],
    newValue: string,
    setNewValue: (v: string) => void,
    type: RefType,
    placeholder: string,
  ) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}{title} ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder={placeholder}
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addItem(type, newValue, setNewValue)}
            className="flex-1"
          />
          <Button size="sm" onClick={() => addItem(type, newValue, setNewValue)}>
            <Plus className="w-4 h-4 mr-1" />Ajouter
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between p-2 border rounded-lg">
              <span className="text-sm font-medium truncate">{item.name}</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-700 shrink-0 ml-2"
                onClick={() => setPendingDelete({ type, id: item.id, name: item.name })}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Données de référence</h1>
          <p className="text-muted-foreground mt-1">Gérez les fonctions, ouvrages concernés, domaines de tension et indications complémentaires</p>
        </div>

        {renderCard("Fonctions", <Briefcase className="w-5 h-5" />, fonctions, newFonction, setNewFonction, "fonctions", "Nouvelle fonction")}
        {renderCard("Ouvrages concernés", <Factory className="w-5 h-5" />, ouvrages, newOuvrage, setNewOuvrage, "ouvrages", "Nouvel ouvrage")}
        {renderCard("Domaines de tension", <Zap className="w-5 h-5" />, domaines, newDomaine, setNewDomaine, "domaines", "Nouveau domaine")}
        {renderCard("Indications complémentaires", <FileText className="w-5 h-5" />, indications, newIndication, setNewIndication, "indications", "Nouvelle indication")}

        <ConfirmDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title="Supprimer"
          description={pendingDelete ? `Supprimer « ${pendingDelete.name} » ?` : ""}
          confirmText="Supprimer"
          variant="danger"
          onConfirm={confirmDelete}
        />
      </div>
    </Layout>
  );
}
