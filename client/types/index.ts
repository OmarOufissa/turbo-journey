export type {
  Employee,
  EmployeeVersion,
  EmployeesPage,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
} from "./employee";

export type {
  ExpirationStatus,
  ExpirationStatusConfig,
} from "./habilitation";

export {
  EXPIRATION_COLOR_CONFIG,
  HT_CODES,
  ST_CODES,
  getExpirationStatus,
  getDaysUntilExpiry,
} from "./habilitation";

// Backward-compat shims
export { getExpirationStatus as getHabilitationStatus } from "./habilitation";
export { EXPIRATION_COLOR_CONFIG as COLOR_CONFIG } from "./habilitation";
export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    expired: "text-red-600 dark:text-red-400",
    lessThan3Months: "text-orange-600 dark:text-orange-400",
    lessThan6Months: "text-yellow-600 dark:text-yellow-400",
    lessThan9Months: "text-blue-600 dark:text-blue-400",
    valid: "text-green-600 dark:text-green-400",
  };
  return map[status] ?? "text-foreground";
}

export type { Division, Service, Equipe } from "./organization";
