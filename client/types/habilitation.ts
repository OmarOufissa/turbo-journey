export interface Habilitation {
  id: number;
  employee_id: number;
  stCodes: string[];  // ST codes array (can be empty)
  htCodes: string[];  // HT codes array (can be empty)
  numero: string | null;
  date_validation: string;
  date_expiration: string;
  pdf_path?: string | null;
}

export interface HabilitationRow extends Habilitation {
  matricule: string;
  prenom: string;
  nom: string;
  division: string;
  service: string;
  equipe: string;
}

export type HabilitationStatus =
  | "expired"
  | "expiringSoon1Month"
  | "expiringSoon2Months"
  | "expiringSoon3Months"
  | "valid";

export interface HabilitationStatusConfig {
  name: string;
  color: string;
  textColor: string;
}

export const COLOR_CONFIG: Record<HabilitationStatus, HabilitationStatusConfig> = {
  expired: {
    name: "Expiré",
    color: "bg-red-500",
    textColor: "text-red-600 dark:text-red-400",
  },
  expiringSoon1Month: {
    name: "1 mois",
    color: "bg-red-400",
    textColor: "text-red-500 dark:text-red-400",
  },
  expiringSoon2Months: {
    name: "2 mois",
    color: "bg-orange-500",
    textColor: "text-orange-600 dark:text-orange-400",
  },
  expiringSoon3Months: {
    name: "3 mois",
    color: "bg-yellow-500",
    textColor: "text-yellow-600 dark:text-yellow-400",
  },
  valid: {
    name: "Valide",
    color: "bg-green-500",
    textColor: "text-green-600 dark:text-green-400",
  },
};

// Valid HT codes (Hors Tension)
export const HT_CODES = ["H0V", "H1V", "H2V", "HC", "B0V", "B1V", "B2V", "BC", "BR", "SF6"];

// Valid ST codes (Sous Tension) - legacy but still supported
export const ST_CODES = ["H1N", "H2N"];

// Combined list of all valid codes
export const ALL_CODES = [...HT_CODES, ...ST_CODES];

export function getHabilitationStatus(hab: Habilitation): HabilitationStatus {
  const expDate = new Date(hab.date_expiration);
  const today = new Date();
  const daysUntilExpiry = Math.ceil(
    (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= 30) return "expiringSoon1Month";
  if (daysUntilExpiry <= 60) return "expiringSoon2Months";
  if (daysUntilExpiry <= 90) return "expiringSoon3Months";
  return "valid";
}

export function getDaysUntilExpiry(dateExpiration: string): number {
  const expDate = new Date(dateExpiration);
  const today = new Date();
  return Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function getStatusColor(status: HabilitationStatus): string {
  return COLOR_CONFIG[status].textColor;
}
