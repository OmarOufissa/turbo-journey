import { apiClient } from "./client";
import { Division, Service, Equipe } from "@/types";

export async function getDivisions(): Promise<Division[]> {
  return apiClient<Division[]>("/api/divisions");
}

export async function getServicesByDivision(
  divisionId: number | string
): Promise<Service[]> {
  return apiClient<Service[]>(`/api/divisions/${divisionId}/services`);
}

export async function getEquipesByService(
  serviceId: number | string
): Promise<Equipe[]> {
  return apiClient<Equipe[]>(`/api/services/${serviceId}/equipes`);
}
