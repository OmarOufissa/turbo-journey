import { apiClient, APIError } from "./client";
import type { HabilitationRequestType, SymbolInfo } from "@shared/habilitationSymbols";

export interface Ouvrage {
  id: number;
  name: string;
  type: string;
  tensionDomain: string;
  divisionId: number;
  serviceId: number;
  equipeId: number | null;
  division: string | null;
  service: string | null;
  equipe: string | null;
}

export interface HabilitationRequestRow {
  symbole: string;
  domaine: string;
  ouvrageId: number;
}

export interface GenerateHabilitationRequestPayload {
  employeeId: number;
  type: HabilitationRequestType;
  rows: HabilitationRequestRow[];
}

export async function getHabilitationSymbols(
  type: HabilitationRequestType,
): Promise<SymbolInfo[]> {
  return apiClient<SymbolInfo[]>(`/api/habilitation-symbols?type=${type}`);
}

export async function searchOuvrages(params: { search?: string; tensionDomain?: string }): Promise<Ouvrage[]> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.tensionDomain) query.set("tensionDomain", params.tensionDomain);
  return apiClient<Ouvrage[]>(`/api/ouvrages?${query.toString()}`);
}

export async function downloadHabilitationRequest(
  payload: GenerateHabilitationRequestPayload,
): Promise<Blob> {
  const token = localStorage.getItem("token");
  const response = await fetch("/api/habilitation-requests/download", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const errJson = await response.json();
      message = errJson.message || message;
    } catch {
      // ignore
    }
    throw new APIError(message, response.status, response.statusText);
  }

  return response.blob();
}
