import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TENSION_DOMAINS, getTensionDomainLabel, type SymbolInfo } from "@shared/habilitationSymbols";
import { Ouvrage, searchOuvrages } from "@/api/habilitationRequests";

export interface RequestRowValue {
  id: string;
  symbole: string;
  domaine: string;
  ouvrageId: number | null;
  ouvrageLabel: string;
}

interface RequestRowEditorProps {
  row: RequestRowValue;
  availableSymbols: SymbolInfo[];
  onChange: (row: RequestRowValue) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export function RequestRowEditor({ row, availableSymbols, onChange, onRemove, canRemove }: RequestRowEditorProps) {
  const [ouvragePopoverOpen, setOuvragePopoverOpen] = useState(false);
  const [ouvrageSearch, setOuvrageSearch] = useState("");
  const [ouvrageResults, setOuvrageResults] = useState<Ouvrage[]>([]);

  useEffect(() => {
    const handle = setTimeout(() => {
      searchOuvrages({ search: ouvrageSearch || undefined, tensionDomain: row.domaine || undefined })
        .then(setOuvrageResults)
        .catch(() => {
          // Silent: dropdown just shows no results
        });
    }, 250);
    return () => clearTimeout(handle);
  }, [ouvrageSearch, row.domaine, ouvragePopoverOpen]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start rounded-lg border p-3">
      <Select value={row.symbole} onValueChange={(v) => onChange({ ...row, symbole: v })}>
        <SelectTrigger>
          <SelectValue placeholder="Symbole" />
        </SelectTrigger>
        <SelectContent>
          {availableSymbols.map((s) => (
            <SelectItem key={s.code} value={s.code}>
              {s.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={row.domaine}
        onValueChange={(v) => onChange({ ...row, domaine: v, ouvrageId: null, ouvrageLabel: "" })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Domaine de tension" />
        </SelectTrigger>
        <SelectContent>
          {TENSION_DOMAINS.map((d) => (
            <SelectItem key={d} value={d}>
              {getTensionDomainLabel(d)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={ouvragePopoverOpen} onOpenChange={setOuvragePopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
            <span className="truncate">{row.ouvrageLabel || "Ouvrage concerné..."}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Rechercher un ouvrage..." value={ouvrageSearch} onValueChange={setOuvrageSearch} />
            <CommandList>
              <CommandEmpty>Aucun ouvrage trouvé.</CommandEmpty>
              <CommandGroup>
                {ouvrageResults.map((ouvrage) => (
                  <CommandItem
                    key={ouvrage.id}
                    value={String(ouvrage.id)}
                    onSelect={() => {
                      onChange({ ...row, ouvrageId: ouvrage.id, ouvrageLabel: ouvrage.name });
                      setOuvragePopoverOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", row.ouvrageId === ouvrage.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col">
                      <span>{ouvrage.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {ouvrage.type} • {ouvrage.tensionDomain}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Button variant="ghost" size="icon" onClick={onRemove} disabled={!canRemove} aria-label="Supprimer la ligne">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
