import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, Save, BookmarkCheck, X, Download } from "lucide-react";
import { Layout } from "@/components/Layout";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Employee } from "@/types/employee";
import { getExpirationStatus, EXPIRATION_COLOR_CONFIG } from "@/types/habilitation";
import { getEmployees, deleteEmployee } from "@/api/employees";

const COLOR_TOGGLE_KEY = "colorCodingEnabled";
const PRESETS_KEY = "employeeFilterPresets";

interface FilterPreset {
  name: string;
  search: string;
  expirationFilter: string;
  hasPdfFilter: string;
}

function loadPresets(): FilterPreset[] {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function savePresets(presets: FilterPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

function getExpirationRange(filter: string): { expirationFrom?: string; expirationTo?: string } {
  const now = new Date().toISOString().split("T")[0];
  const plus = (days: number) => new Date(Date.now() + days * 864e5).toISOString().split("T")[0];
  if (filter === "expired") return { expirationTo: now };
  if (filter === "3m") return { expirationFrom: now, expirationTo: plus(90) };
  if (filter === "6m") return { expirationFrom: now, expirationTo: plus(180) };
  if (filter === "9m") return { expirationFrom: now, expirationTo: plus(270) };
  return {};
}

export default function Employees() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expirationFilter, setExpirationFilter] = useState("all");
  const [hasPdfFilter, setHasPdfFilter] = useState("all");
  const [presets, setPresets] = useState<FilterPreset[]>(loadPresets);
  const [newPresetName, setNewPresetName] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [colorCodingEnabled, setColorCodingEnabled] = useState(() => {
    return localStorage.getItem(COLOR_TOGGLE_KEY) !== "false";
  });

  const token = localStorage.getItem("token");

  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, any> = { page, limit: 20 };
      if (searchTerm) params.search = searchTerm;
      if (hasPdfFilter !== "all") params.hasPdf = hasPdfFilter;
      const range = getExpirationRange(expirationFilter);
      if (range.expirationFrom) params.expirationFrom = range.expirationFrom;
      if (range.expirationTo) params.expirationTo = range.expirationTo;

      const res = await getEmployees(params);
      if (res.success) {
        setEmployees(res.data.employees);
        setTotal(res.data.total);
      }
    } catch (err) {
      toast({ title: "Erreur", description: "Impossible de charger les employés", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [page, searchTerm, expirationFilter, hasPdfFilter, toast]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  useEffect(() => {
    localStorage.setItem(COLOR_TOGGLE_KEY, String(colorCodingEnabled));
  }, [colorCodingEnabled]);

  const handleDelete = async (id: number, matricule: string) => {
    if (!window.confirm(`Supprimer l'employé ${matricule} ?`)) return;
    try {
      await deleteEmployee(id);
      toast({ title: "Succès", description: `Employé ${matricule} supprimé` });
      fetchEmployees();
    } catch {
      toast({ title: "Erreur", description: "Impossible de supprimer l'employé", variant: "destructive" });
    }
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;
    const preset: FilterPreset = { name: newPresetName.trim(), search: searchTerm, expirationFilter, hasPdfFilter };
    const updated = [...presets.filter(p => p.name !== preset.name), preset];
    setPresets(updated);
    savePresets(updated);
    setNewPresetName("");
    setShowSavePreset(false);
    toast({ title: "Preset enregistré", description: `"${preset.name}" sauvegardé` });
  };

  const handleLoadPreset = (preset: FilterPreset) => {
    setSearchTerm(preset.search);
    setExpirationFilter(preset.expirationFilter);
    setHasPdfFilter(preset.hasPdfFilter);
    setPage(1);
  };

  const handleDeletePreset = (name: string) => {
    const updated = presets.filter(p => p.name !== name);
    setPresets(updated);
    savePresets(updated);
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <Layout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Employés ({total})</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/api/employees/export" download>
                <Download className="w-4 h-4 mr-1" />Exporter
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setColorCodingEnabled(v => !v)}>
              {colorCodingEnabled ? "Désactiver couleurs" : "Activer couleurs"}
            </Button>
            <Button asChild size="sm">
              <Link to="/employees/add"><Plus className="w-4 h-4 mr-1" />Ajouter</Link>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-end">
          <Input
            placeholder="Rechercher par matricule, nom, prénom..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
            className="max-w-xs"
          />
          <Select value={expirationFilter} onValueChange={v => { setExpirationFilter(v); setPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Expiration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes expirations</SelectItem>
              <SelectItem value="expired">Expirés</SelectItem>
              <SelectItem value="3m">&lt; 3 mois</SelectItem>
              <SelectItem value="6m">&lt; 6 mois</SelectItem>
              <SelectItem value="9m">&lt; 9 mois</SelectItem>
            </SelectContent>
          </Select>
          <Select value={hasPdfFilter} onValueChange={v => { setHasPdfFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="PDF" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous (PDF)</SelectItem>
              <SelectItem value="true">Avec PDF</SelectItem>
              <SelectItem value="false">Sans PDF</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => setShowSavePreset(v => !v)}>
            <Save className="w-3 h-3 mr-1" />Sauvegarder
          </Button>

          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {presets.map(p => (
                <Badge
                  key={p.name}
                  variant="secondary"
                  className="cursor-pointer gap-1 pr-1"
                >
                  <span onClick={() => handleLoadPreset(p)}><BookmarkCheck className="w-3 h-3 inline mr-1" />{p.name}</span>
                  <button onClick={() => handleDeletePreset(p.name)} className="hover:text-destructive ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {showSavePreset && (
          <div className="flex gap-2 items-center">
            <Input
              placeholder="Nom du preset..."
              value={newPresetName}
              onChange={e => setNewPresetName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSavePreset()}
              className="max-w-xs"
              autoFocus
            />
            <Button size="sm" onClick={handleSavePreset}>Enregistrer</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowSavePreset(false)}>Annuler</Button>
          </div>
        )}

        {isLoading ? (
          <LoadingSpinner />
        ) : employees.length === 0 ? (
          <EmptyState
            title="Aucun employé"
            description="Ajoutez votre premier employé ou modifiez les filtres"
            action={<Link to="/employees/add"><Button>Ajouter un employé</Button></Link>}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matricule</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Fonction</TableHead>
                  <TableHead>Division / Service</TableHead>
                  <TableHead>ST / HT</TableHead>
                  <TableHead>Expiration</TableHead>
                  <TableHead>PDF</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map(emp => {
                  const ver = emp.currentVersion;
                  const status = ver ? getExpirationStatus(ver.dateExpiration) : "valid";
                  const config = EXPIRATION_COLOR_CONFIG[status];
                  const stStr = ver && ver.stCodes.length > 0 ? ver.stCodes.join(", ") : "XXX";
                  const htStr = ver && ver.htCodes.length > 0 ? ver.htCodes.join(", ") : "XXX";

                  return (
                    <TableRow
                      key={emp.id}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50 transition-colors",
                        colorCodingEnabled && config.bgColor
                      )}
                      onClick={() => navigate(`/employees/${emp.id}`)}
                    >
                      <TableCell className="font-mono font-medium">{emp.matricule}</TableCell>
                      <TableCell>{emp.prenom} {emp.nom}</TableCell>
                      <TableCell>{ver?.fonction ?? "—"}</TableCell>
                      <TableCell>{ver ? `${ver.division} / ${ver.service}` : "—"}</TableCell>
                      <TableCell className="font-mono text-sm">
                        ST: {stStr} / HT: {htStr}
                      </TableCell>
                      <TableCell>
                        {ver ? (
                          <span className={cn("text-sm font-medium", colorCodingEnabled && config.textColor)}>
                            {new Date(ver.dateExpiration).toLocaleDateString("fr-FR")}
                            {colorCodingEnabled && ` (${config.name})`}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {ver?.pdfPath ? (
                          <Badge variant="secondary" className="text-xs">PDF</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()} className="flex gap-1">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/employees/${emp.id}/edit`}>Modifier</Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(emp.id, emp.matricule)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  Précédent
                </Button>
                <span className="text-sm text-muted-foreground">Page {page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  Suivant
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
