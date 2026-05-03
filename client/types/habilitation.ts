export type ExpirationStatus = "expired" | "lessThan3Months" | "lessThan6Months" | "lessThan9Months" | "valid";

export interface ExpirationStatusConfig {
  name: string;
  color: string;
  textColor: string;
  bgColor: string;
}

export const EXPIRATION_COLOR_CONFIG: Record<ExpirationStatus, ExpirationStatusConfig> = {
  expired: {
    name: "Expiré",
    color: "red",
    textColor: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-950",
  },
  lessThan3Months: {
    name: "< 3 mois",
    color: "orange",
    textColor: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-950",
  },
  lessThan6Months: {
    name: "< 6 mois",
    color: "yellow",
    textColor: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-950",
  },
  lessThan9Months: {
    name: "< 9 mois",
    color: "blue",
    textColor: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-950",
  },
  valid: {
    name: "Valide",
    color: "green",
    textColor: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-950",
  },
};

// All valid ST codes
export const ST_CODES = ["H0V", "H1V", "BR", "H2V", "HC", "SF6"];

// All valid HT codes
export const HT_CODES = ["B0V", "B1V", "BR", "B2V", "BC", "SF6"];

export function getExpirationStatus(dateExpiration: string): ExpirationStatus {
  const now = Date.now();
  const exp = new Date(dateExpiration).getTime();
  const diff = exp - now;
  const ms90 = 90 * 24 * 60 * 60 * 1000;
  const ms180 = 180 * 24 * 60 * 60 * 1000;
  const ms270 = 270 * 24 * 60 * 60 * 1000;

  if (diff < 0) return "expired";
  if (diff <= ms90) return "lessThan3Months";
  if (diff <= ms180) return "lessThan6Months";
  if (diff <= ms270) return "lessThan9Months";
  return "valid";
}

export function getDaysUntilExpiry(dateExpiration: string): number {
  return Math.ceil((new Date(dateExpiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
