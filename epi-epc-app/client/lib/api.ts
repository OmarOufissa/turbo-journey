const TOKEN_KEY = "gepi_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    if (!location.pathname.startsWith("/login")) location.href = "/login";
    throw new ApiError(401, "Session expirée");
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, (data as any)?.error ?? "Erreur inconnue");
  return data as T;
}

export function apiGet<T = unknown>(path: string) {
  return api<T>(path);
}
export function apiPost<T = unknown>(path: string, body?: unknown) {
  return api<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });
}
export function apiPut<T = unknown>(path: string, body?: unknown) {
  return api<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) });
}
export function apiDelete<T = unknown>(path: string) {
  return api<T>(path, { method: "DELETE" });
}

export function downloadFile(path: string) {
  const token = getToken();
  fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(async (res) => {
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const filename = match?.[1] ?? "export";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => alert("Échec du téléchargement du rapport"));
}
