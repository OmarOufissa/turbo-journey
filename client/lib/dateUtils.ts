/**
 * Client-side centralized date utilities — mirrors server/utils/dateUtils.ts.
 * Single source of truth for all frontend date operations.
 */

const FR_MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

// ─── Formatting ────────────────────────────────────────────────────────────

/** Format ISO date string as "14 Février 2026" */
export function formatDateFrench(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = parseToDate(dateStr);
  if (!d) return dateStr;
  return `${d.getUTCDate()} ${FR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Format ISO date as DD/MM/YYYY */
export function formatDateDMY(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = parseToDate(dateStr);
  if (!d) return dateStr;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

/** Format ISO date as YYYY-MM-DD */
export function formatDateISO(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = parseToDate(dateStr);
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Parsing ───────────────────────────────────────────────────────────────

/**
 * Parse any supported date format to a Date object (UTC midnight).
 * Supports: YYYY-MM-DD, DD/MM/YYYY, D/M/YYYY, D/M/YY, ISO 8601.
 */
export function parseToDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string") return null;
  const text = (value as string).trim();
  if (!text) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const d = new Date(`${text}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY or D/M/YYYY or D/M/YY
  if (text.includes("/")) {
    const parts = text.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      let year = parseInt(parts[2], 10);
      if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
      if (year < 100) year += year < 50 ? 2000 : 1900;
      if (!isValidCalendarDate(year, month, day)) return null;
      return new Date(Date.UTC(year, month - 1, day));
    }
  }

  // ISO 8601 with time component
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const d = new Date(text);
    if (isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  return null;
}

/** Parse to YYYY-MM-DD string, or null. */
export function toISODate(value: unknown): string | null {
  const d = parseToDate(value);
  if (!d) return null;
  return formatDateISO(d.toISOString().slice(0, 10));
}

/** Parse DD/MM/YYYY string to YYYY-MM-DD, or null. */
export function parseDateFR(str: string): string | null {
  return parseToDate(str) ? toISODate(str) : null;
}

// ─── Validation ────────────────────────────────────────────────────────────

export function isValidDate(value: unknown): boolean {
  return parseToDate(value) !== null;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

// ─── Expiration helpers ────────────────────────────────────────────────────

/** Days until expiration. Negative = already expired. */
export function daysUntilExpiration(dateStr: string | null | undefined): number {
  if (!dateStr) return -Infinity;
  const d = parseToDate(dateStr);
  if (!d) return -Infinity;
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((d.getTime() - todayUTC) / 86400000);
}

export type ExpirationStatus = "expired" | "3m" | "6m" | "9m" | "valid";

/** Expiration threshold bucket for color coding. */
export function getExpirationThreshold(
  dateStr: string | null | undefined
): ExpirationStatus {
  const days = daysUntilExpiration(dateStr);
  if (days < 0) return "expired";
  if (days <= 90) return "3m";
  if (days <= 180) return "6m";
  if (days <= 270) return "9m";
  return "valid";
}

/** CSS color class for expiration status. */
export function expirationColorClass(status: ExpirationStatus): string {
  switch (status) {
    case "expired": return "text-red-600 dark:text-red-400";
    case "3m": return "text-red-500 dark:text-red-300";
    case "6m": return "text-orange-500 dark:text-orange-300";
    case "9m": return "text-yellow-500 dark:text-yellow-300";
    case "valid": return "text-green-600 dark:text-green-400";
  }
}

/** Background badge color for expiration status. */
export function expirationBadgeClass(status: ExpirationStatus): string {
  switch (status) {
    case "expired": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "3m": return "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400";
    case "6m": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    case "9m": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "valid": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  }
}

/** Human-readable relative expiration label. */
export function expirationLabel(dateStr: string | null | undefined): string {
  const days = daysUntilExpiration(dateStr);
  if (!isFinite(days)) return "Date inconnue";
  if (days < 0) return `Expiré depuis ${Math.abs(days)}j`;
  if (days === 0) return "Expire aujourd'hui";
  if (days === 1) return "Expire demain";
  if (days < 31) return `Expire dans ${days}j`;
  const months = Math.floor(days / 30);
  return `Expire dans ${months} mois`;
}

// ─── Now helpers ───────────────────────────────────────────────────────────

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
