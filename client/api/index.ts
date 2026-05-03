// Base client
export { apiClient, APIError } from "./client";

// Employee APIs
export {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "./employees";

// Habilitation APIs
export {
  createHabilitation,
  updateHabilitation,
  deleteHabilitation,
  batchUpdateHabilitations,
  batchDeleteHabilitations,
  batchUploadPdfs,
} from "./habilitations";

export type {
  CreateHabilitationRequest,
  UpdateHabilitationRequest,
  BatchUpdateHabilitationsRequest,
  BatchDeleteHabilitationsRequest,
} from "./habilitations";

// Organization APIs
export {
  getDivisions,
  getServicesByDivision,
  getEquipesByService,
} from "./organization";
