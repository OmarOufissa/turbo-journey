/**
 * HABILITATION DISPLAY HELPER
 * 
 * Enforces strict display format for ST and HT habilitations
 * Format: ST: {codes OR XXX} / HT: {codes OR XXX}
 * 
 * CRITICAL RULES:
 * 1. Both ST and HT always present in display
 * 2. If array is empty: show "XXX"
 * 3. If codes present: show comma-separated list
 * 4. Exact spacing and format required (no variations)
 */

/**
 * Format codes array for display
 * - Empty array → "XXX"
 * - Single code → code as-is
 * - Multiple → comma-separated
 */
export function formatCodesForDisplay(codes: string[] | undefined | null): string {
  if (!codes || codes.length === 0) {
    return "XXX";
  }
  return codes.join(", ");
}

/**
 * Format complete habilitation display
 * Returns: "ST: {codes} / HT: {codes}"
 * 
 * @param stCodes - Array of ST codes (can be empty)
 * @param htCodes - Array of HT codes (can be empty)
 * @returns Formatted string with exact format
 */
export function formatHabilitationDisplay(
  stCodes: string[] | undefined | null,
  htCodes: string[] | undefined | null
): string {
  const stFormatted = formatCodesForDisplay(stCodes);
  const htFormatted = formatCodesForDisplay(htCodes);
  
  return `ST: ${stFormatted} / HT: ${htFormatted}`;
}

/**
 * Get badge information for display
 * Returns separate badges for ST and HT codes
 */
export interface HabilitationBadge {
  type: "ST" | "HT";
  codes: string[];
  display: string;
  hasData: boolean;
}

export function getHabilitationBadges(
  stCodes: string[] | undefined | null,
  htCodes: string[] | undefined | null
): HabilitationBadge[] {
  const badges: HabilitationBadge[] = [];

  // Always add ST badge (even if empty)
  badges.push({
    type: "ST",
    codes: stCodes || [],
    display: formatCodesForDisplay(stCodes),
    hasData: !!(stCodes && stCodes.length > 0),
  });

  // Always add HT badge (even if empty)
  badges.push({
    type: "HT",
    codes: htCodes || [],
    display: formatCodesForDisplay(htCodes),
    hasData: !!(htCodes && htCodes.length > 0),
  });

  return badges;
}

/**
 * Validate habilitation data
 * At least one array must be non-empty
 */
export function validateHabilitation(
  stCodes: string[] | undefined | null,
  htCodes: string[] | undefined | null
): { valid: boolean; error?: string } {
  const stHasData = stCodes && stCodes.length > 0;
  const htHasData = htCodes && htCodes.length > 0;

  if (!stHasData && !htHasData) {
    return {
      valid: false,
      error: "At least one habilitation code (ST or HT) is required",
    };
  }

  return { valid: true };
}

/**
 * Check if habilitation is "complete" (has at least one code)
 */
export function isHabilitationComplete(
  stCodes: string[] | undefined | null,
  htCodes: string[] | undefined | null
): boolean {
  return validateHabilitation(stCodes, htCodes).valid;
}

/**
 * Parse habilitation codes from string input
 * Accepts: "H1N, H2N" or "H1N,H2N" etc
 * Returns: cleaned array of codes
 */
export function parseCodesFromString(codeString: string): string[] {
  if (!codeString || typeof codeString !== "string") {
    return [];
  }

  return codeString
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code.length > 0);
}

/**
 * Get CSS classes for badge styling
 */
export function getHabilitationBadgeClasses(type: "ST" | "HT"): string {
  if (type === "ST") {
    return "bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-200";
  } else {
    return "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200";
  }
}

/**
 * Get display label for habilitation type
 */
export function getHabilitationTypeLabel(type: "ST" | "HT"): string {
  return type === "ST" ? "Sous Tension" : "Hors Tension";
}

/**
 * Valid habilitation codes (for reference and validation)
 */
export const VALID_HABILITATION_CODES = [
  "H0V", "H1V", "H2V", "HC",  // HT codes
  "B0V", "B1V", "B2V", "BC",  // HT codes (alt)
  "H1N", "H2N",               // ST codes
  "BR", "SF6"                 // Misc codes
];

/**
 * Validate code against valid codes list
 */
export function isValidCode(code: string): boolean {
  return VALID_HABILITATION_CODES.includes(code.toUpperCase());
}

/**
 * Get available codes for a given type
 * (can be customized per organization)
 */
export function getAvailableCodesForType(type: "ST" | "HT"): string[] {
  if (type === "ST") {
    return ["H1N", "H2N"];
  } else {
    return ["H0V", "H1V", "H2V", "HC", "B0V", "B1V", "B2V", "BC", "BR", "SF6"];
  }
}
