import { apiClient } from "./client";
import { Employee, CreateEmployeeRequest } from "@/types";

export async function getEmployees(): Promise<Employee[]> {
  return apiClient<Employee[]>("/api/employees");
}

export async function getEmployee(id: number | string): Promise<Employee> {
  return apiClient<Employee>(`/api/employees/${id}`);
}

export async function createEmployee(
  data: CreateEmployeeRequest
): Promise<Employee> {
  return apiClient<Employee>("/api/employees", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateEmployee(
  id: number | string,
  data: Partial<CreateEmployeeRequest>
): Promise<Employee> {
  return apiClient<Employee>(`/api/employees/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteEmployee(
  id: number | string
): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/api/employees/${id}`, {
    method: "DELETE",
  });
}
