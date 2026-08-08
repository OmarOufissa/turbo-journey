/**
 * Habilitation symbol taxonomy for electrical work authorizations.
 *
 * Source: "Annexes procédure habilitation des agents BE sur ouvrages
 * électriques" (Annexe n°2, n°3, n°10-1/10-2 and the AVIS notice) and the
 * "Annexe demande HAE TST" form. Symbols are decomposed exactly as described
 * in the official AVIS notice printed on every titre d'habilitation:
 *
 *   - 1st letter (B or H): domaine de tension (Basse Tension / Haute Tension)
 *   - index (0, 1, 2) or letter (R, C): attribution / champ d'application
 *   - optional trailing letter: V (voisinage), T (travaux sous tension),
 *     N (nettoyage sous tension)
 *
 * No symbol outside this authoritative list is ever produced or accepted.
 */

export type HabilitationRequestType = "HT" | "ST";

export interface SymbolInfo {
  code: string;
  type: HabilitationRequestType;
  tensionLetter: "B" | "H";
  tensionDomain: string;
  champApplication: string;
}

// Hors tension / BR symbols (Annexe n°2, Annexe n°5-1, n°10-1)
export const HT_SYMBOLS = [
  "B0",
  "B1",
  "B2",
  "BC",
  "BR",
  "B0V",
  "B1V",
  "B2V",
  "H0",
  "H1",
  "H2",
  "HC",
  "H0V",
  "H1V",
  "H2V",
  "SF6",
] as const;

// Sous tension / TST symbols (Annexe n°3 "Annexe demande HAE TST")
export const ST_SYMBOLS = [
  "B1T",
  "B2T",
  "H1T",
  "H2T",
  "B1N",
  "B2N",
  "H1N",
  "H2N",
] as const;

export const ALL_SYMBOLS = [...HT_SYMBOLS, ...ST_SYMBOLS];

const TENSION_DOMAIN_LABEL: Record<"B" | "H", string> = {
  B: "Basse Tension (BT)",
  H: "Haute Tension (HTA/HTB)",
};

const CHAMP_APPLICATION_LABEL: Record<string, string> = {
  "0": "Exécutant non électricien informé des risques électriques",
  "1": "Exécutant électricien",
  "2": "Chargé de travaux électricien",
  C: "Chargé de consignation",
  R: "Chargé d'intervention (BR)",
};

function decodeSymbol(code: string): SymbolInfo {
  const tensionLetter = code.startsWith("H") ? "H" : "B";
  const type: HabilitationRequestType = (ST_SYMBOLS as readonly string[]).includes(code)
    ? "ST"
    : "HT";

  if (code === "SF6") {
    return {
      code,
      type,
      tensionLetter,
      tensionDomain: TENSION_DOMAIN_LABEL[tensionLetter],
      champApplication: "Intervention sur appareillage à isolation SF6",
    };
  }

  const rest = code.slice(1); // e.g. "1V", "2T", "C", "R", "1N"
  const attributionKey = rest[0];
  const suffix = rest.slice(1);

  const parts: string[] = [];
  if (CHAMP_APPLICATION_LABEL[attributionKey]) {
    parts.push(CHAMP_APPLICATION_LABEL[attributionKey]);
  }
  if (suffix === "V") parts.push("travaux au voisinage de pièces nues sous tension");
  if (suffix === "T") parts.push("travaux sous tension");
  if (suffix === "N") parts.push("nettoyage sous tension");

  return {
    code,
    type,
    tensionLetter,
    tensionDomain: TENSION_DOMAIN_LABEL[tensionLetter],
    champApplication: parts.join(" / ") || "Non défini",
  };
}

export const SYMBOL_INFO: Record<string, SymbolInfo> = Object.fromEntries(
  ALL_SYMBOLS.map((code) => [code, decodeSymbol(code)]),
);

export function getSymbolsForType(type: HabilitationRequestType): SymbolInfo[] {
  return (type === "HT" ? HT_SYMBOLS : ST_SYMBOLS).map((code) => SYMBOL_INFO[code]);
}

export function getSymbolInfo(code: string): SymbolInfo | null {
  return SYMBOL_INFO[code.toUpperCase()] ?? null;
}

export function isSymbolValidForType(code: string, type: HabilitationRequestType): boolean {
  const info = getSymbolInfo(code);
  return info !== null && info.type === type;
}

/** Tension domain letter (B or H) implied by a set of chosen symbols. Empty if mixed/none. */
export function getTensionLettersForSymbols(codes: string[]): Array<"B" | "H"> {
  const letters = new Set(codes.map((c) => getSymbolInfo(c)?.tensionLetter).filter(Boolean));
  return Array.from(letters) as Array<"B" | "H">;
}

/** Human-readable, deduplicated "champ d'application" summary for the selected symbols. */
export function summarizeChampApplication(codes: string[]): string[] {
  const set = new Set<string>();
  for (const code of codes) {
    const info = getSymbolInfo(code);
    if (info) set.add(info.champApplication);
  }
  return Array.from(set);
}

/** Ouvrage tension domain values compatible with a tension letter (B => BT, H => HTA/HTB). */
export function tensionDomainsForLetter(letter: "B" | "H"): string[] {
  return letter === "B" ? ["BT"] : ["HTA", "HTB"];
}
