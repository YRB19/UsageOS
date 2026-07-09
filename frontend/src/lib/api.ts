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

type AccountPatch = Partial<DashboardAccount> & {
  notify_telegram?: boolean;
  telegram_chat_id?: string | null;
  notify_whatsapp?: boolean;
  whatsapp_number?: string | null;
  notify_reset?: boolean;
  notify_threshold?: number | null;
};

export const api = {
  dashboard: (): Promise<{ accounts: DashboardAccount[] }> =>
    apiFetch("/api/v1/dashboard"),

  patchAccount: (id: string, body: AccountPatch) =>
    apiFetch(`/api/v1/accounts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  getNote: (id: string): Promise<{ content: string; updated_at: string }> =>
    apiFetch(`/api/v1/accounts/${id}/notes`),

  putNote: (id: string, content: string) =>
    apiFetch(`/api/v1/accounts/${id}/notes`, { method: "PUT", body: JSON.stringify({ content }) }),

  history: (id: string, limitType = "session", days = 7): Promise<SnapshotPoint[]> =>
    apiFetch(`/api/v1/accounts/${id}/history?limit_type=${limitType}&days=${days}`),

  // Notifications
  testNotification: (accountId: string, channel: "telegram" | "whatsapp") =>
    apiFetch(`/api/v1/notifications/accounts/${accountId}/test`, {
      method: "POST",
      body: JSON.stringify({ channel }),
    }),
};
