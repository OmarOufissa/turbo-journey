import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { HierarchieCascade } from "@/components/shared/HierarchieCascade";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ArticleReference } from "@shared/api";

const DEFAULT_LABELS = ["Catégorie générale", "Famille", "Sous-famille"];

/**
 * Cascade Catégorie > Famille > Sous-famille (via HierarchieCascade) puis, une
 * fois le nœud terminal atteint, sélection de l'article de référence rattaché
 * — tout article physique devant obligatoirement être rattaché à une
 * référence de catalogue (jamais directement à la classification).
 */
export function ArticleReferencePicker({
  value,
  onChange,
  labels = DEFAULT_LABELS,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  labels?: string[];
}) {
  const [hierarchieId, setHierarchieId] = useState<number | null>(null);
  const hydratedFor = useRef<number | null>(null);

  const { data: currentRef } = useQuery<ArticleReference>({
    queryKey: ["article-reference-hydrate", value],
    queryFn: () => apiGet(`/articles-reference/${value}`),
    enabled: value != null,
  });

  useEffect(() => {
    if (currentRef && hydratedFor.current !== value) {
      setHierarchieId(currentRef.hierarchieParentId);
      hydratedFor.current = value;
    }
  }, [currentRef, value]);

  const { data: refsAtNode } = useQuery<{ rows: ArticleReference[] }>({
    queryKey: ["hierarchie-refs-for-picker", hierarchieId],
    queryFn: () => apiGet(`/articles-reference?hierarchieParentId=${hierarchieId}&actif=true&pageSize=200`),
    enabled: hierarchieId != null,
  });

  return (
    <div className="space-y-2">
      <HierarchieCascade
        value={hierarchieId}
        onChange={(id) => {
          setHierarchieId(id);
          hydratedFor.current = value;
          onChange(null);
        }}
        labels={labels}
      />
      {hierarchieId != null && (
        <Select value={value != null ? String(value) : undefined} onValueChange={(v) => onChange(Number(v))}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Article de référence…" />
          </SelectTrigger>
          <SelectContent>
            {refsAtNode?.rows.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                {r.designation} ({r.code})
              </SelectItem>
            ))}
            {refsAtNode?.rows.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">Aucune référence à ce niveau</div>
            )}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
