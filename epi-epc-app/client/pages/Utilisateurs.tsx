import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RoleBadge } from "@/components/shared/Badges";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@shared/api";

interface UserRow {
  id: number;
  username: string;
  nom: string;
  role: Role;
  actif: boolean;
  derniereConnexion: string | null;
}

export default function Utilisateurs() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery<UserRow[]>({ queryKey: ["users"], queryFn: () => apiGet("/users") });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/users", body),
    onSuccess: () => {
      toast.success("Utilisateur créé");
      qc.invalidateQueries({ queryKey: ["users"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      username: fd.get("username"),
      nom: fd.get("nom"),
      role: fd.get("role"),
      password: fd.get("password"),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground">Comptes applicatifs et profils d'accès</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nouvel utilisateur</Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Identifiant</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Dernière connexion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Chargement…</TableCell></TableRow>}
            {data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-sm">{u.username}</TableCell>
                <TableCell className="font-medium">{u.nom}</TableCell>
                <TableCell><RoleBadge role={u.role} /></TableCell>
                <TableCell><Badge variant={u.actif ? "success" : "muted"}>{u.actif ? "Actif" : "Désactivé"}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{formatDate(u.derniereConnexion)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvel utilisateur</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="username">Identifiant *</Label><Input id="username" name="username" required /></div>
            <div className="space-y-1.5"><Label htmlFor="nom">Nom complet *</Label><Input id="nom" name="nom" required /></div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Rôle</Label>
              <select id="role" name="role" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm" defaultValue="consultation">
                {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="password">Mot de passe *</Label><Input id="password" name="password" type="password" required minLength={6} /></div>
            <div className="flex items-center gap-2 pt-1"><Switch defaultChecked disabled /><Label>Compte actif</Label></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending}>Créer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
