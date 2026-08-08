import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertCircle, Check, ChevronsUpDown, Download, Eye, FileText, Search, X } from "lucide-react";
import type { Employee } from "@/types";
import { getEmployees } from "@/api/employees";
import {
  Ouvrage,
  downloadHabilitationRequestDocx,
  downloadHabilitationRequestPdf,
  getHabilitationSymbols,
  previewHabilitationRequest,
  searchOuvrages,
} from "@/api/habilitationRequests";
import { APIError } from "@/api/client";
import type { HabilitationRequestType, SymbolInfo } from "@shared/habilitationSymbols";

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

  // Step 1: agent
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [agentPopoverOpen, setAgentPopoverOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Step 2: type
  const [type, setType] = useState<HabilitationRequestType | "">("");

  // Step 3: symbols
  const [availableSymbols, setAvailableSymbols] = useState<SymbolInfo[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);

  // Step 4: ouvrages
  const [ouvrageSearch, setOuvrageSearch] = useState("");
  const [ouvrageResults, setOuvrageResults] = useState<Ouvrage[]>([]);
  const [selectedOuvrages, setSelectedOuvrages] = useState<Ouvrage[]>([]);
  const [ouvragePopoverOpen, setOuvragePopoverOpen] = useState(false);

  // Generation
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

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

  // Reset symbols when type changes
  useEffect(() => {
    setSelectedSymbols([]);
    setPreviewUrl(null);
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

  // Tension domain implied by selected symbols (B => BT, H => HTA/HTB), used to
  // narrow down ouvrages so incompatible combinations aren't offered.
  const impliedTensionDomains = useMemo(() => {
    const letters = new Set(
      selectedSymbols
        .map((code) => availableSymbols.find((s) => s.code === code)?.tensionLetter)
        .filter(Boolean),
    );
    const domains = new Set<string>();
    if (letters.has("B")) domains.add("BT");
    if (letters.has("H")) {
      domains.add("HTA");
      domains.add("HTB");
    }
    return Array.from(domains);
  }, [selectedSymbols, availableSymbols]);

  const champApplication = useMemo(() => {
    const set = new Set<string>();
    for (const code of selectedSymbols) {
      const info = availableSymbols.find((s) => s.code === code);
      if (info) set.add(info.champApplication);
    }
    return Array.from(set);
  }, [selectedSymbols, availableSymbols]);

  // Search ouvrages (debounced) whenever the search term or tension filter changes
  useEffect(() => {
    const handle = setTimeout(() => {
      searchOuvrages({
        search: ouvrageSearch || undefined,
        tensionDomain: impliedTensionDomains.length ? impliedTensionDomains : undefined,
      })
        .then(setOuvrageResults)
        .catch(() => {
          // Silent: search box will just show no results
        });
    }, 250);
    return () => clearTimeout(handle);
  }, [ouvrageSearch, impliedTensionDomains]);

  function toggleSymbol(code: string) {
    setPreviewUrl(null);
    setGenerated(false);
    setSelectedSymbols((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  function toggleOuvrage(ouvrage: Ouvrage) {
    setPreviewUrl(null);
    setGenerated(false);
    setSelectedOuvrages((prev) =>
      prev.some((o) => o.id === ouvrage.id)
        ? prev.filter((o) => o.id !== ouvrage.id)
        : [...prev, ouvrage],
    );
  }

  function validate(): string | null {
    if (!selectedEmployee) return "Veuillez sélectionner un agent.";
    if (!type) return "Veuillez sélectionner le type de travaux.";
    if (selectedSymbols.length === 0) return "Veuillez sélectionner le symbole d'habilitation.";
    if (selectedOuvrages.length === 0) return "Veuillez sélectionner au moins un ouvrage concerné.";
    return null;
  }

  function buildPayload() {
    return {
      employeeId: selectedEmployee!.id,
      type: type as HabilitationRequestType,
      symbols: selectedSymbols,
      ouvrageIds: selectedOuvrages.map((o) => o.id),
    };
  }

  function handleGenerate() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setGenerated(false);
      return;
    }
    setError(null);
    setPreviewUrl(null);
    setGenerated(true);
  }

  async function handlePreview() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const blob = await previewHabilitationRequest(buildPayload());
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err) {
      const message = err instanceof APIError ? err.message : "Erreur lors de la génération de l'aperçu";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDownload(format: "pdf" | "docx") {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const blob =
        format === "pdf"
          ? await downloadHabilitationRequestPdf(buildPayload())
          : await downloadHabilitationRequestDocx(buildPayload());
      triggerBlobDownload(blob, `demande_habilitation_${type}_${selectedEmployee!.matricule}.${format}`);
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

        {/* Step 1: Agent */}
        <Card>
          <CardHeader>
            <CardTitle>Agent</CardTitle>
            <CardDescription>Rechercher un agent par nom, prénom ou matricule</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Popover open={agentPopoverOpen} onOpenChange={setAgentPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
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
                            setPreviewUrl(null);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedEmployee?.id === emp.id ? "opacity-100" : "opacity-0",
                            )}
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
                <div><span className="text-muted-foreground">Service : </span>{selectedEmployee.service}</div>
                <div><span className="text-muted-foreground">Équipe : </span>{selectedEmployee.equipe}</div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Habilitations actuelles : </span>
                  {selectedEmployee.habilitations?.length ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedEmployee.habilitations.flatMap((h) => [...h.htCodes, ...h.stCodes]).map(
                        (code, i) => (
                          <Badge key={`${code}-${i}`} variant="secondary">{code}</Badge>
                        ),
                      )}
                    </div>
                  ) : (
                    "Aucune"
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Type de travaux */}
        <Card>
          <CardHeader>
            <CardTitle>Type de travaux</CardTitle>
            <CardDescription>Sélectionnez le type de demande</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as HabilitationRequestType)}
              className="flex gap-6"
            >
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

        {/* Step 3: Symbole d'habilitation */}
        {type && (
          <Card>
            <CardHeader>
              <CardTitle>Symbole d'habilitation demandé</CardTitle>
              <CardDescription>
                Symboles disponibles pour les travaux {type === "HT" ? "hors tension" : "sous tension"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {availableSymbols.map((symbol) => (
                  <button
                    key={symbol.code}
                    type="button"
                    onClick={() => toggleSymbol(symbol.code)}
                    title={`${symbol.tensionDomain} — ${symbol.champApplication}`}
                    className={cn(
                      "px-3 py-2 rounded border transition-colors text-sm font-medium",
                      selectedSymbols.includes(symbol.code)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-foreground border-border hover:bg-muted/70",
                    )}
                  >
                    {symbol.code}
                  </button>
                ))}
              </div>

              {selectedSymbols.length > 0 && (
                <div className="rounded-lg border p-3 text-sm space-y-2">
                  <div>
                    <span className="font-medium">Domaine de tension : </span>
                    {Array.from(
                      new Set(
                        selectedSymbols.map(
                          (c) => availableSymbols.find((s) => s.code === c)?.tensionDomain,
                        ),
                      ),
                    ).join(", ")}
                  </div>
                  <div>
                    <span className="font-medium">Champ d'application : </span>
                    {champApplication.join(" ; ")}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Ouvrages concernés */}
        {selectedSymbols.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Ouvrages concernés</CardTitle>
              <CardDescription>
                Recherchez et sélectionnez un ou plusieurs ouvrages compatibles avec le domaine
                de tension sélectionné
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Popover open={ouvragePopoverOpen} onOpenChange={setOuvragePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    <span className="flex items-center gap-2">
                      <Search className="h-4 w-4 opacity-50" />
                      Rechercher un ouvrage...
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Nom de l'ouvrage..."
                      value={ouvrageSearch}
                      onValueChange={setOuvrageSearch}
                    />
                    <CommandList>
                      <CommandEmpty>Aucun ouvrage trouvé.</CommandEmpty>
                      <CommandGroup>
                        {ouvrageResults.map((ouvrage) => (
                          <CommandItem
                            key={ouvrage.id}
                            value={String(ouvrage.id)}
                            onSelect={() => toggleOuvrage(ouvrage)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedOuvrages.some((o) => o.id === ouvrage.id)
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{ouvrage.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {ouvrage.type} • {ouvrage.tensionDomain} • {ouvrage.division} /{" "}
                                {ouvrage.service}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {selectedOuvrages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedOuvrages.map((ouvrage) => (
                    <Badge key={ouvrage.id} variant="secondary" className="gap-1 py-1.5">
                      {ouvrage.name}
                      <button
                        type="button"
                        onClick={() => toggleOuvrage(ouvrage)}
                        aria-label={`Retirer ${ouvrage.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Generation */}
        {selectedOuvrages.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Génération de la demande</CardTitle>
              <CardDescription>
                Vérifiez les informations puis générez le document
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={handleGenerate} size="lg">
                Générer la demande
              </Button>

              {generated && (
                <div className="space-y-4 pt-2 border-t">
                  <div className="flex flex-wrap gap-3 pt-4">
                    <Button onClick={handlePreview} disabled={isGenerating} variant="outline">
                      <Eye className="mr-2 h-4 w-4" />
                      Prévisualiser
                    </Button>
                    <Button onClick={() => handleDownload("pdf")} disabled={isGenerating}>
                      <Download className="mr-2 h-4 w-4" />
                      Télécharger PDF
                    </Button>
                    <Button onClick={() => handleDownload("docx")} disabled={isGenerating} variant="secondary">
                      <FileText className="mr-2 h-4 w-4" />
                      Télécharger Word
                    </Button>
                  </div>

                  {previewUrl && (
                    <div className="border rounded-lg overflow-hidden" style={{ height: "70vh" }}>
                      <iframe src={previewUrl} title="Aperçu de la demande" className="w-full h-full" />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
