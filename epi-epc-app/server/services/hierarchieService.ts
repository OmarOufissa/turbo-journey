import { db } from "../db";
import { equipementHierarchie } from "../db/schema";

export interface HierarchieNode {
  id: number;
  parentId: number | null;
  code: string;
  nom: string;
  niveau: number;
  ordre: number;
  soumisControleReglementaire: boolean;
}

// L'arborescence (≈230 nœuds, alimentée uniquement par la migration/le seed, jamais
// par les utilisateurs) tient entièrement en mémoire — inutile d'introduire des
// requêtes récursives (CTE), absentes du reste du code, pour la parcourir.
async function loadAllNodes(): Promise<HierarchieNode[]> {
  return db.select().from(equipementHierarchie);
}

/** Nœuds enfants directs d'un nœud donné (racine = catégories générales si parentId omis). */
export async function listChildren(parentId: number | null): Promise<HierarchieNode[]> {
  const all = await loadAllNodes();
  return all.filter((n) => n.parentId === parentId).sort((a, b) => a.ordre - b.ordre);
}

/** Le nœud lui-même + tous ses descendants (pour un filtre "tout ce qui est sous X"). */
export async function resolveDescendantIds(nodeId: number): Promise<number[]> {
  const all = await loadAllNodes();
  const byParent = new Map<number | null, HierarchieNode[]>();
  for (const n of all) {
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  const ids: number[] = [nodeId];
  const stack = [nodeId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const child of byParent.get(current) ?? []) {
      ids.push(child.id);
      stack.push(child.id);
    }
  }
  return ids;
}

// Pour un regroupement de type "par famille" (ex. graphiques, tableau de bord
// règlementaire) : ramène tout nœud (souvent un type d'équipement, niveau 4) à
// son ancêtre "famille" (niveau 2) — ou au nœud lui-même s'il est déjà à ce
// niveau ou plus haut, pour rester robuste aux branches moins profondes.
export async function getFamilleAncestorMap(): Promise<Map<number, HierarchieNode>> {
  const all = await loadAllNodes();
  const byId = new Map(all.map((n) => [n.id, n]));
  const result = new Map<number, HierarchieNode>();
  for (const n of all) {
    let current = n;
    while (current.niveau > 2 && current.parentId != null) {
      current = byId.get(current.parentId)!;
    }
    result.set(n.id, current);
  }
  return result;
}

/** Chaîne complète des ancêtres, de la catégorie générale (racine) jusqu'au nœud lui-même. */
export async function getAncestorChain(nodeId: number): Promise<HierarchieNode[]> {
  const all = await loadAllNodes();
  const byId = new Map(all.map((n) => [n.id, n]));
  const chain: HierarchieNode[] = [];
  let current = byId.get(nodeId);
  while (current) {
    chain.unshift(current);
    current = current.parentId != null ? byId.get(current.parentId) : undefined;
  }
  return chain;
}
