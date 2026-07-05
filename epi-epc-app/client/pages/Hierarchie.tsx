import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, ShieldCheck, Tag } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import type { HierarchieNode, ArticleReference } from "@shared/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";

type NodeDialog =
  | { mode: "create-node"; parentId: number | null }
  | { mode: "edit-node"; node: HierarchieNode }
  | { mode: "create-reference"; parentId: number };

export default function Hierarchie() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<NodeDialog | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HierarchieNode | ArticleReference | null>(null);

  const { data: roots, isLoading } = useQuery<HierarchieNode[]>({ queryKey: ["hierarchie", null], queryFn: () => apiGet("/articles/hierarchie") });

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const createNodeMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/articles/hierarchie", body),
    onSuccess: (_d, vars) => {
      toast.success("Nœud créé");
      qc.invalidateQueries({ queryKey: ["hierarchie", (vars as any).parentId ?? null] });
      setDialog(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateNodeMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPut(`/articles/hierarchie/${id}`, body),
    onSuccess: () => {
      toast.success("Nœud modifié");
      qc.invalidateQueries({ queryKey: ["hierarchie"] });
      setDialog(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleReglementaireMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: boolean }) => apiPut(`/articles/hierarchie/${id}`, { soumisControleReglementaireExplicite: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hierarchie"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNodeMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/articles/hierarchie/${id}`),
    onSuccess: () => {
      toast.success("Nœud supprimé");
      qc.invalidateQueries({ queryKey: ["hierarchie"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createReferenceMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/articles-reference", body),
    onSuccess: (_d, vars) => {
      toast.success("Article de référence créé");
      qc.invalidateQueries({ queryKey: ["hierarchie-references", (vars as any).hierarchieParentId] });
      setDialog(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteReferenceMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/articles-reference/${id}`),
    onSuccess: () => {
      toast.success("Article de référence supprimé");
      qc.invalidateQueries({ queryKey: ["hierarchie-references"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmitNode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dialog) return;
    const fd = new FormData(e.currentTarget);
    if (dialog.mode === "create-node") {
      createNodeMutation.mutate({ parentId: dialog.parentId, nom: String(fd.get("nom")), ordre: Number(fd.get("ordre") || 0) });
    } else if (dialog.mode === "edit-node") {
      updateNodeMutation.mutate({ id: dialog.node.id, body: { nom: String(fd.get("nom")), ordre: Number(fd.get("ordre") || 0) } });
    }
  }

  function onSubmitReference(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dialog || dialog.mode !== "create-reference") return;
    const fd = new FormData(e.currentTarget);
    const normes = String(fd.get("normes") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const certifications = String(fd.get("certifications") || "").split(",").map((s) => s.trim()).filter(Boolean);
    createReferenceMutation.mutate({
      hierarchieParentId: dialog.parentId,
      designation: String(fd.get("designation")),
      normes: normes.length ? normes : undefined,
      certifications: certifications.length ? certifications : undefined,
      dureeVieRecommandeeMois: fd.get("dureeVieRecommandeeMois") ? Number(fd.get("dureeVieRecommandeeMois")) : undefined,
      quantiteReference: fd.get("quantiteReference") ? Number(fd.get("quantiteReference")) : undefined,
      typeDotation: String(fd.get("typeDotation") || "") || undefined,
      observations: String(fd.get("observations") || "") || undefined,
    });
  }

  if (isLoading || !roots) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Classification des équipements</h1>
          <p className="text-sm text-muted-foreground">Catégorie → Famille → Sous-famille → Articles de référence</p>
        </div>
        <Button onClick={() => setDialog({ mode: "create-node", parentId: null })}><Plus className="h-4 w-4" /> Nouvelle catégorie</Button>
      </div>

      <Card>
        <CardContent className="divide-y divide-border p-0">
          {roots.map((node) => (
            <HierarchieBranch
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              onEdit={(n) => setDialog({ mode: "edit-node", node: n })}
              onAddChild={(parentId) => setDialog({ mode: "create-node", parentId })}
              onAddReference={(parentId) => setDialog({ mode: "create-reference", parentId })}
              onToggleReglementaire={(n, value) => toggleReglementaireMutation.mutate({ id: n.id, value })}
              onDeleteNode={(n) => setDeleteTarget(n)}
              onDeleteReference={(r) => setDeleteTarget(r)}
            />
          ))}
          {roots.length === 0 && <p className="p-4 text-sm text-muted-foreground">Aucune catégorie</p>}
        </CardContent>
      </Card>

      <Dialog open={dialog?.mode === "create-node" || dialog?.mode === "edit-node"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.mode === "edit-node" ? "Modifier le nœud" : "Nouveau nœud de classification"}</DialogTitle></DialogHeader>
          <form onSubmit={onSubmitNode} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nom">Nom *</Label>
              <Input id="nom" name="nom" required autoFocus defaultValue={dialog?.mode === "edit-node" ? dialog.node.nom : ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ordre">Ordre d'affichage</Label>
              <Input id="ordre" name="ordre" type="number" defaultValue={dialog?.mode === "edit-node" ? dialog.node.ordre : 0} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Annuler</Button>
              <Button type="submit" disabled={createNodeMutation.isPending || updateNodeMutation.isPending}>Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.mode === "create-reference"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nouvel article de référence</DialogTitle></DialogHeader>
          <form onSubmit={onSubmitReference} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="designation">Désignation *</Label>
              <Input id="designation" name="designation" required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dureeVieRecommandeeMois">Durée de vie recommandée (mois)</Label>
                <Input id="dureeVieRecommandeeMois" name="dureeVieRecommandeeMois" type="number" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantiteReference">Quantité de référence</Label>
                <Input id="quantiteReference" name="quantiteReference" type="number" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="typeDotation">Type de dotation</Label>
              <Input id="typeDotation" name="typeDotation" placeholder="individuelle, collective…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="normes">Normes (séparées par une virgule)</Label>
              <Input id="normes" name="normes" placeholder="EN 397, EN 50365…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="certifications">Certifications (séparées par une virgule)</Label>
              <Input id="certifications" name="certifications" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="observations">Observations</Label>
              <Textarea id="observations" name="observations" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Annuler</Button>
              <Button type="submit" disabled={createReferenceMutation.isPending}>Créer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmer la suppression</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Supprimer « {deleteTarget && "nom" in deleteTarget ? deleteTarget.nom : deleteTarget?.designation} » ? Cette action est irréversible et échouera si des éléments y sont encore rattachés.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteNodeMutation.isPending || deleteReferenceMutation.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                if ("nom" in deleteTarget) deleteNodeMutation.mutate(deleteTarget.id);
                else deleteReferenceMutation.mutate(deleteTarget.id);
              }}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HierarchieBranch({
  node,
  depth,
  expanded,
  onToggle,
  onEdit,
  onAddChild,
  onAddReference,
  onToggleReglementaire,
  onDeleteNode,
  onDeleteReference,
}: {
  node: HierarchieNode;
  depth: number;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onEdit: (n: HierarchieNode) => void;
  onAddChild: (parentId: number) => void;
  onAddReference: (parentId: number) => void;
  onToggleReglementaire: (n: HierarchieNode, value: boolean) => void;
  onDeleteNode: (n: HierarchieNode) => void;
  onDeleteReference: (r: ArticleReference) => void;
}) {
  const isOpen = expanded.has(node.id);
  const { data: children } = useQuery<HierarchieNode[]>({
    queryKey: ["hierarchie", node.id],
    queryFn: () => apiGet(`/articles/hierarchie?parentId=${node.id}`),
    enabled: isOpen,
  });
  const { data: references } = useQuery<{ rows: ArticleReference[] }>({
    queryKey: ["hierarchie-references", node.id],
    queryFn: () => apiGet(`/articles-reference?hierarchieParentId=${node.id}&pageSize=200`),
    enabled: isOpen,
  });

  return (
    <div style={{ paddingLeft: depth > 0 ? 8 : 0 }}>
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button onClick={() => onToggle(node.id)} className="flex flex-1 items-center gap-2 text-left">
          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="font-medium">{node.nom}</span>
          {node.codeAbrege && <Badge variant="outline">{node.codeAbrege}</Badge>}
          {node.soumisControleReglementaire && <Badge variant="muted"><ShieldCheck className="mr-1 h-3 w-3" /> Réglementaire</Badge>}
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Réglementaire</span>
          <Switch checked={node.soumisControleReglementaireExplicite ?? false} onCheckedChange={(v) => onToggleReglementaire(node, v)} />
        </div>
        <Button size="sm" variant="ghost" onClick={() => onAddChild(node.id)}><Plus className="h-3.5 w-3.5" /> Sous-catégorie</Button>
        <Button size="sm" variant="ghost" onClick={() => onAddReference(node.id)}><Tag className="h-3.5 w-3.5" /> Référence</Button>
        <Button size="sm" variant="ghost" onClick={() => onEdit(node)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" onClick={() => onDeleteNode(node)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
      </div>
      {isOpen && (
        <div className="ml-6 space-y-0.5 border-l border-border pl-4">
          {children?.map((child) => (
            <HierarchieBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onAddReference={onAddReference}
              onToggleReglementaire={onToggleReglementaire}
              onDeleteNode={onDeleteNode}
              onDeleteReference={onDeleteReference}
            />
          ))}
          {references?.rows.map((ref) => (
            <div key={ref.id} className="flex items-center gap-2 py-1.5 text-sm">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              <Link to={`/articles-reference/${ref.id}`} className="flex-1 hover:underline">
                {ref.designation} <span className="text-xs text-muted-foreground">({ref.code})</span>
              </Link>
              {!ref.actif && <Badge variant="muted">Inactif</Badge>}
              <Badge variant="outline">{ref.nbArticles ?? 0} article(s)</Badge>
              <Button size="sm" variant="ghost" onClick={() => onDeleteReference(ref)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
            </div>
          ))}
          {isOpen && (children?.length ?? 0) === 0 && (references?.rows.length ?? 0) === 0 && (
            <p className="py-2 text-xs text-muted-foreground">Aucun sous-élément</p>
          )}
        </div>
      )}
    </div>
  );
}
