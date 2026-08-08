import { apiClient } from "./client";
import { Habilitation } from "@/types";

export interface CreateHabilitationRequest {
  employee_id: number;
  type: "HT" | "ST";
  codes: string[];
  numero: string;
  date_validation: string;
}

export interface UpdateHabilitationRequest {
  codes: string[];
  numero?: string;
  date_validation: string;
  date_expiration?: string;
}

export interface BatchUpdateHabilitationsRequest {
  habilitationIds: number[];
  codes: string[];
  date_validation: string;
}

export interface BatchDeleteHabilitationsRequest {
  habilitationIds: number[];
}

export async function createHabilitation(
  data: CreateHabilitationRequest
): Promise<Habilitation> {
  return apiClient<Habilitation>("/api/habilitations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateHabilitation(
  habId: number,
  data: UpdateHabilitationRequest
): Promise<Habilitation> {
  return apiClient<Habilitation>(`/api/habilitations/${habId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteHabilitation(
  habId: number
): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/api/habilitations/${habId}`, {
    method: "DELETE",
  });
}

export async function batchUpdateHabilitations(
  data: BatchUpdateHabilitationsRequest
): Promise<{
  message: string;
  updated: number;
  habilitations: Habilitation[];
}> {
  return apiClient("/api/habilitations/batch-update", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function batchDeleteHabilitations(
  data: BatchDeleteHabilitationsRequest
): Promise<{
  message: string;
  deleted: number;
}> {
  return apiClient("/api/habilitations/batch-delete", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function batchUploadPdfs(
  habilitationIds: number[],
  files: File[]
): Promise<{
  message: string;
  uploaded: number;
}> {
  const formData = new FormData();
  
  files.forEach((file) => {
    formData.append("pdfs", file);
  });
  
  formData.append("habilitationIds", JSON.stringify(habilitationIds));

  const token = localStorage.getItem("token");
  
  const response = await fetch("/api/habilitations/batch-upload-pdf", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to upload PDFs");
  }

  return response.json();
}
