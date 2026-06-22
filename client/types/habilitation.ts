import { daysUntilExpiration, getExpirationThreshold } from "@/lib/dateUtils";

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

// ST (Sous Tension) codes — travaux sous tension only.
export const ST_CODES = ["H1N", "H2N", "H1T", "H2T"];

// HT (Hors Tension) codes — everything else, incl. SF6.
export const HT_CODES = ["H0V", "B0V", "H1V", "B1V", "H2V", "B2V", "HC", "BC", "BR", "SF6"];

export function getExpirationStatus(dateExpiration: string): ExpirationStatus {
  return getExpirationThreshold(dateExpiration);
}

export function getDaysUntilExpiry(dateExpiration: string): number {
  return daysUntilExpiration(dateExpiration);
}
