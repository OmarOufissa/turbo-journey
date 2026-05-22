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

// Organization APIs
export {
  getDivisions,
  getServicesByDivision,
  getEquipesByService,
} from "./organization";
