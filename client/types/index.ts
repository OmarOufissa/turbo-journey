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

export type { Division, Service, Equipe } from "./organization";
