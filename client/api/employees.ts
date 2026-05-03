import { apiClient } from "./client";
import { Employee, EmployeesPage, CreateEmployeeRequest, UpdateEmployeeRequest } from "@/types/employee";

export async function getEmployees(params?: {
  page?: number;
  limit?: number;
  deleted?: boolean;
}): Promise<{ success: boolean; data: EmployeesPage; error: null }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.deleted) qs.set('deleted', 'true');
  const query = qs.toString() ? `?${qs}` : '';
  return apiClient(`/api/employees${query}`);
}

export async function getEmployee(id: number | string): Promise<{ success: boolean; data: Employee; error: null }> {
  return apiClient(`/api/employees/${id}`);
}

export async function createEmployee(data: CreateEmployeeRequest): Promise<{ success: boolean; data: { employee: Employee; auditLogId: number }; error: null }> {
  return apiClient(`/api/employees`, { method: "POST", body: JSON.stringify(data) });
}

export async function updateEmployee(id: number | string, data: UpdateEmployeeRequest): Promise<{ success: boolean; data: { employee: Employee; auditLogId: number }; error: null }> {
  return apiClient(`/api/employees/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteEmployee(id: number | string): Promise<{ success: boolean; data: { auditLogId: number }; error: null }> {
  return apiClient(`/api/employees/${id}`, { method: "DELETE" });
}

export async function restoreEmployee(id: number | string): Promise<{ success: boolean; data: { employee: Employee; auditLogId: number }; error: null }> {
  return apiClient(`/api/employees/${id}/restore`, { method: "POST" });
}

export async function permanentDeleteEmployee(id: number | string, confirmMatricule: string): Promise<{ success: boolean; data: { deleted: boolean }; error: null }> {
  return apiClient(`/api/employees/${id}/permanent`, { method: "DELETE", body: JSON.stringify({ confirmMatricule }) });
}

export async function revertToVersion(id: number | string, versionId: number | string): Promise<{ success: boolean; data: { employee: Employee; auditLogId: number }; error: null }> {
  return apiClient(`/api/employees/${id}/revert/${versionId}`, { method: "POST" });
}

export async function getStats(): Promise<{ success: boolean; data: any; error: null }> {
  return apiClient(`/api/stats`);
}
