import type { DashboardAccount, SnapshotPoint } from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "";
const KEY  = import.meta.env.VITE_API_KEY  ?? "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  dashboard: (): Promise<{ accounts: DashboardAccount[] }> =>
    apiFetch("/api/v1/dashboard"),

  patchAccount: (id: string, body: Partial<Pick<DashboardAccount, "nickname" | "project_name" | "color">>) =>
    apiFetch(`/api/v1/accounts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  getNote: (id: string): Promise<{ content: string; updated_at: string }> =>
    apiFetch(`/api/v1/accounts/${id}/notes`),

  putNote: (id: string, content: string) =>
    apiFetch(`/api/v1/accounts/${id}/notes`, { method: "PUT", body: JSON.stringify({ content }) }),

  history: (id: string, limitType = "session", days = 7): Promise<SnapshotPoint[]> =>
    apiFetch(`/api/v1/accounts/${id}/history?limit_type=${limitType}&days=${days}`),
};
