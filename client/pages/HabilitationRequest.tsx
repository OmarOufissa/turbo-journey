import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertCircle, Check, ChevronsUpDown, Download, Plus } from "lucide-react";
import type { Employee } from "@/types";
import { getEmployees } from "@/api/employees";
import {
  downloadHabilitationRequest,
  getHabilitationSymbols,
} from "@/api/habilitationRequests";
import { APIError } from "@/api/client";
import type { HabilitationRequestType, SymbolInfo } from "@shared/habilitationSymbols";
import { RequestRowEditor, RequestRowValue } from "@/components/habilitationRequest/RequestRowEditor";

function emptyRow(): RequestRowValue {
  return { id: crypto.randomUUID(), symbole: "", domaine: "", ouvrageId: null, ouvrageLabel: "" };
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function HabilitationRequest() {
  const { toast } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [agentPopoverOpen, setAgentPopoverOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const [type, setType] = useState<HabilitationRequestType | "">("");
  const [availableSymbols, setAvailableSymbols] = useState<SymbolInfo[]>([]);
  const [rows, setRows] = useState<RequestRowValue[]>([emptyRow()]);

  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    getEmployees()
      .then(setEmployees)
      .catch(() => {
        toast({
          title: "Erreur",
          description: "Impossible de charger la liste des agents",
          variant: "destructive",
        });
      });
  }, []);

  useEffect(() => {
    setRows([emptyRow()]);
    if (!type) {
      setAvailableSymbols([]);
      return;
    }
    getHabilitationSymbols(type)
      .then(setAvailableSymbols)
      .catch(() => {
        toast({
          title: "Erreur",
          description: "Impossible de charger les symboles d'habilitation",
          variant: "destructive",
        });
      });
  }, [type]);

  function updateRow(updated: RequestRowValue) {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function validate(): string | null {
    if (!selectedEmployee) return "Veuillez sélectionner un agent.";
    if (!type) return "Veuillez sélectionner le type de travaux.";
    if (rows.length === 0) return "Veuillez ajouter au moins une ligne d'habilitation.";
    for (const row of rows) {
      if (!row.symbole) return "Veuillez sélectionner le symbole d'habilitation.";
      if (!row.domaine) return "Veuillez sélectionner un domaine de tension.";
      if (!row.ouvrageId) return "Veuillez sélectionner un ouvrage concerné.";
    }
    return null;
  }

  async function handleGenerate() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const blob = await downloadHabilitationRequest({
        employeeId: selectedEmployee!.id,
        type: type as HabilitationRequestType,
        rows: rows.map((r) => ({ symbole: r.symbole, domaine: r.domaine, ouvrageId: r.ouvrageId! })),
      });
      triggerBlobDownload(blob, `demande_habilitation_${type}_${selectedEmployee!.matricule}.docx`);
      toast({ title: "Document généré", description: "Le téléchargement a démarré." });
    } catch (err) {
      const message = err instanceof APIError ? err.message : "Erreur lors de la génération du document";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Demande d'habilitation</h1>
          <p className="text-muted-foreground mt-1">
            Générez automatiquement une demande d'habilitation électrique à partir des
            données déjà enregistrées.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Agent</CardTitle>
            <CardDescription>Rechercher un agent par nom, prénom ou matricule</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Popover open={agentPopoverOpen} onOpenChange={setAgentPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedEmployee
                    ? `${selectedEmployee.nom} ${selectedEmployee.prenom} - ${selectedEmployee.matricule}`
                    : "Rechercher un agent..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Nom, prénom ou matricule..." />
                  <CommandList>
                    <CommandEmpty>Aucun agent trouvé.</CommandEmpty>
                    <CommandGroup>
                      {employees.map((emp) => (
                        <CommandItem
                          key={emp.id}
                          value={`${emp.nom} ${emp.prenom} ${emp.matricule}`}
                          onSelect={() => {
                            setSelectedEmployee(emp);
                            setAgentPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn("mr-2 h-4 w-4", selectedEmployee?.id === emp.id ? "opacity-100" : "opacity-0")}
                          />
                          {emp.nom} {emp.prenom} — Mle {emp.matricule}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selectedEmployee && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border p-4 text-sm">
                <div><span className="text-muted-foreground">Nom : </span>{selectedEmployee.nom}</div>
                <div><span className="text-muted-foreground">Prénom : </span>{selectedEmployee.prenom}</div>
                <div><span className="text-muted-foreground">Matricule : </span>{selectedEmployee.matricule}</div>
                <div><span className="text-muted-foreground">Fonction : </span>{selectedEmployee.fonction || "-"}</div>
                <div><span className="text-muted-foreground">Division : </span>{selectedEmployee.division}</div>
                <div><span className="text-muted-foreground">Équipe : </span>{selectedEmployee.equipe || selectedEmployee.service || "-"}</div>
                {selectedEmployee.habilitations && selectedEmployee.habilitations.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Habilitations actuelles : </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedEmployee.habilitations.flatMap((h) => [...h.htCodes, ...h.stCodes]).map((code, i) => (
                        <Badge key={`${code}-${i}`} variant="secondary">{code}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Type de travaux</CardTitle>
            <CardDescription>Sélectionnez le type de demande</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={type} onValueChange={(v) => setType(v as HabilitationRequestType)} className="flex gap-6">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="HT" id="type-ht" />
                <Label htmlFor="type-ht" className="cursor-pointer">Travaux hors tension — HT</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ST" id="type-st" />
                <Label htmlFor="type-st" className="cursor-pointer">Travaux sous tension — ST</Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {type && (
          <Card>
            <CardHeader>
              <CardTitle>Habilitations demandées</CardTitle>
              <CardDescription>
                Pour chaque habilitation : symbole, domaine de tension et ouvrage concerné.
                Ajoutez une ligne par habilitation supplémentaire.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rows.map((row) => (
                <RequestRowEditor
                  key={row.id}
                  row={row}
                  availableSymbols={availableSymbols}
                  onChange={updateRow}
                  onRemove={() => removeRow(row.id)}
                  canRemove={rows.length > 1}
                />
              ))}
              <Button variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
                <Plus className="mr-2 h-4 w-4" />
                Ajouter une ligne
              </Button>
            </CardContent>
          </Card>
        )}

        {type && (
          <Button onClick={handleGenerate} disabled={isGenerating} size="lg">
            <Download className="mr-2 h-4 w-4" />
            Générer et télécharger la demande
          </Button>
        )}
      </div>
    </Layout>
  );
}
