/**
 * Centralized date utilities — single source of truth for all date operations.
 * Handles FR locale formatting, robust parsing, and expiration calculations.
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
  if (!d || isNaN(d.getTime())) return dateStr;
  return `${d.getUTCDate()} ${FR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Format ISO date as DD/MM/YYYY */
export function formatDateDMY(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = parseToDate(dateStr);
  if (!d || isNaN(d.getTime())) return dateStr;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

/** Format ISO date as YYYY-MM-DD */
export function formatDateISO(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = parseToDate(dateStr);
  if (!d || isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Parsing ───────────────────────────────────────────────────────────────

/**
 * Parse any supported date format to a Date object (UTC midnight).
 * Supports: YYYY-MM-DD, DD/MM/YYYY, D/M/YYYY, D/M/YY, ISO 8601, Excel serials (number).
 */
export function parseToDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;

  // Excel serial (number of days since 1900-01-00)
  if (typeof value === "number" && !isNaN(value) && value > 0) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;

  // YYYY-MM-DD (strict ISO date)
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
      // 2-digit year: 00-49 → 2000-2049, 50-99 → 1950-1999
      if (year < 100) year += year < 50 ? 2000 : 1900;
      if (!isValidCalendarDate(year, month, day)) return null;
      return new Date(Date.UTC(year, month - 1, day));
    }
  }

  // ISO 8601 with time component (truncate to date)
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const d = new Date(text);
    if (isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  return null;
}

/** Parse date string to YYYY-MM-DD ISO string, or null if invalid. */
export function toISODate(value: unknown): string | null {
  const d = parseToDate(value);
  if (!d) return null;
  return formatDateISO(d.toISOString().slice(0, 10));
}

/** Parse DD/MM/YYYY (with leap year validation) to YYYY-MM-DD, or null. */
export function parseDateFR(str: string): string | null {
  const result = parseToDate(str);
  return result ? formatDateISO(result.toISOString().slice(0, 10)) : null;
}

// ─── Validation ────────────────────────────────────────────────────────────

/** True if value parses to a valid calendar date. */
export function isValidDate(value: unknown): boolean {
  return parseToDate(value) !== null;
}

/** True if year/month/day is a valid Gregorian calendar date (leap-year-aware). */
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

// ─── Expiration helpers ────────────────────────────────────────────────────

/** Number of whole days from today until expiration (negative = already expired). */
export function daysUntilExpiration(dateStr: string | null | undefined): number {
  if (!dateStr) return -Infinity;
  const d = parseToDate(dateStr);
  if (!d) return -Infinity;
  const todayUTC = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate()
  );
  return Math.floor((d.getTime() - todayUTC) / 86400000);
}

/** Expiration threshold bucket for color coding and alerts. */
export function getExpirationThreshold(
  dateStr: string | null | undefined
): "expired" | "3m" | "6m" | "9m" | "valid" {
  const days = daysUntilExpiration(dateStr);
  if (days < 0) return "expired";
  if (days <= 90) return "3m";
  if (days <= 180) return "6m";
  if (days <= 270) return "9m";
  return "valid";
}

/** Human-readable relative label for expiration date. */
export function expirationLabel(dateStr: string | null | undefined): string {
  const days = daysUntilExpiration(dateStr);
  if (!isFinite(days)) return "Date inconnue";
  if (days < 0) return `Expiré depuis ${Math.abs(days)} jour${Math.abs(days) > 1 ? "s" : ""}`;
  if (days === 0) return "Expire aujourd'hui";
  if (days === 1) return "Expire demain";
  if (days < 31) return `Expire dans ${days} jours`;
  const months = Math.floor(days / 30);
  return `Expire dans ${months} mois`;
}

/**
 * Calculate expiration date from validation date.
 * HT habilitations: 3 years. ST: 1 year.
 */
export function calculateExpirationFromValidation(
  validationDateStr: string,
  type: "HT" | "ST"
): string {
  const d = parseToDate(validationDateStr);
  if (!d) return validationDateStr;
  const years = type === "HT" ? 3 : 1;
  const exp = new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()));
  return formatDateISO(exp.toISOString().slice(0, 10))!;
}

// ─── Now helpers ───────────────────────────────────────────────────────────

/** Current date as YYYY-MM-DD (UTC). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Current datetime as ISO 8601 string. */
export function nowISO(): string {
  return new Date().toISOString();
}
