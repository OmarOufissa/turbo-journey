export type ExpirationStatus = "expired" | "3m" | "6m" | "9m" | "valid";

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
  "3m": {
    name: "< 3 mois",
    color: "orange",
    textColor: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-950",
  },
  "6m": {
    name: "< 6 mois",
    color: "violet",
    textColor: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-100 dark:bg-violet-950",
  },
  "9m": {
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
  if (diff <= ms90) return "3m";
  if (diff <= ms180) return "6m";
  if (diff <= ms270) return "9m";
  return "valid";
}

export function getDaysUntilExpiry(dateExpiration: string): number {
  return Math.ceil((new Date(dateExpiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
