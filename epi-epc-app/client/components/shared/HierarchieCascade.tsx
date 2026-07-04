import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { HierarchieNode } from "@shared/api";

interface HierarchieCascadeProps {
  /** Id du nœud le plus précis actuellement choisi (peut être à n'importe quel niveau), ou null. */
  value: number | null;
  onChange: (id: number | null) => void;
  /** Affiche une option "Toutes/Tous" à chaque niveau — utilisé pour les filtres, pas les formulaires de saisie. */
  allowAll?: boolean;
  /** Libellés des placeholders par niveau (0 = catégorie générale). À défaut : "Niveau N". */
  labels?: string[];
  className?: string;
}

function useHierarchieChildren(parentId: number | null) {
  return useQuery<HierarchieNode[]>({
    queryKey: ["hierarchie-enfants", parentId],
    queryFn: () => apiGet(`/articles/hierarchie${parentId != null ? `?parentId=${parentId}` : ""}`),
  });
}

function useAncestorChain(value: number | null) {
  return useQuery<HierarchieNode[]>({
    queryKey: ["hierarchie-ancetres", value],
    queryFn: () => apiGet(`/articles/hierarchie/${value}/ancetres`),
    enabled: value != null,
  });
}

function CascadeLevel({
  parentId,
  selected,
  onSelect,
  allowAll,
  placeholder,
}: {
  parentId: number | null;
  selected: number | null;
  onSelect: (id: number | null) => void;
  allowAll: boolean;
  placeholder: string;
}) {
  const { data: options } = useHierarchieChildren(parentId);
  if (!options || options.length === 0) return null;

  return (
    <Select value={selected != null ? String(selected) : "all"} onValueChange={(v) => onSelect(v === "all" ? null : Number(v))}>
      <SelectTrigger className="w-56">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value="all">{placeholder}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.id} value={String(o.id)}>
            {o.nom}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Listes déroulantes en cascade sur equipement_hierarchie (Catégorie générale >
 * Famille > Sous-famille > Type…, profondeur variable) : chaque niveau charge
 * ses options en fonction du niveau précédemment choisi, et s'arrête de
 * lui-même dès qu'un nœud n'a plus d'enfants (pas de profondeur figée).
 */
export function HierarchieCascade({ value, onChange, allowAll = false, labels, className }: HierarchieCascadeProps) {
  const chainQuery = useAncestorChain(value);
  const [path, setPath] = useState<(number | null)[]>([]);
  const hydratedFor = useRef<number | null>(null);

  useEffect(() => {
    if (value == null) {
      if (hydratedFor.current !== null) {
        setPath([]);
        hydratedFor.current = null;
      }
      return;
    }
    if (chainQuery.data && hydratedFor.current !== value) {
      setPath(chainQuery.data.map((n) => n.id));
      hydratedFor.current = value;
    }
  }, [value, chainQuery.data]);

  function handleSelect(levelIdx: number, id: number | null) {
    const next = path.slice(0, levelIdx);
    next[levelIdx] = id;
    setPath(next);
    hydratedFor.current = id ?? (levelIdx > 0 ? (next[levelIdx - 1] ?? null) : null);
    let deepest: number | null = null;
    for (const p of next) if (p != null) deepest = p;
    onChange(deepest);
  }

  const renderLevels: { parentId: number | null; selected: number | null }[] = [{ parentId: null, selected: path[0] ?? null }];
  for (let i = 0; path[i] != null; i++) {
    renderLevels.push({ parentId: path[i], selected: path[i + 1] ?? null });
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {renderLevels.map((lvl, i) => (
        <CascadeLevel
          key={i}
          parentId={lvl.parentId}
          selected={lvl.selected}
          onSelect={(id) => handleSelect(i, id)}
          allowAll={allowAll}
          placeholder={labels?.[i] ?? `Niveau ${i + 1}`}
        />
      ))}
    </div>
  );
}
