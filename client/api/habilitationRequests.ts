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

export interface GenerateHabilitationRequestPayload {
  employeeId: number;
  type: HabilitationRequestType;
  symbols: string[];
  ouvrageIds: number[];
}

export async function getHabilitationSymbols(
  type: HabilitationRequestType,
): Promise<SymbolInfo[]> {
  return apiClient<SymbolInfo[]>(`/api/habilitation-symbols?type=${type}`);
}

export async function searchOuvrages(params: {
  search?: string;
  divisionId?: number;
  serviceId?: number;
  equipeId?: number;
  tensionDomain?: string[];
}): Promise<Ouvrage[]> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.divisionId) query.set("divisionId", String(params.divisionId));
  if (params.serviceId) query.set("serviceId", String(params.serviceId));
  if (params.equipeId) query.set("equipeId", String(params.equipeId));
  if (params.tensionDomain?.length) query.set("tensionDomain", params.tensionDomain.join(","));

  return apiClient<Ouvrage[]>(`/api/ouvrages?${query.toString()}`);
}

async function fetchDocumentBlob(
  endpoint: string,
  payload: GenerateHabilitationRequestPayload,
): Promise<Blob> {
  const token = localStorage.getItem("token");
  const response = await fetch(endpoint, {
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

export function previewHabilitationRequest(
  payload: GenerateHabilitationRequestPayload,
): Promise<Blob> {
  return fetchDocumentBlob("/api/habilitation-requests/preview", payload);
}

export function downloadHabilitationRequestPdf(
  payload: GenerateHabilitationRequestPayload,
): Promise<Blob> {
  return fetchDocumentBlob("/api/habilitation-requests/download.pdf", payload);
}

export function downloadHabilitationRequestDocx(
  payload: GenerateHabilitationRequestPayload,
): Promise<Blob> {
  return fetchDocumentBlob("/api/habilitation-requests/download.docx", payload);
}
