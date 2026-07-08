export function formatCountdown(resetsAt: string | null): string {
  if (!resetsAt) return "";
  const diff = new Date(resetsAt).getTime() - Date.now();
  if (diff <= 0) return "Resetting…";

  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);

  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatResetTime(resetsAt: string | null): string {
  if (!resetsAt) return "";
  return new Date(resetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function pctColor(pct: number | null): string {
  if (pct === null) return "#6b7280";
  if (pct >= 100)   return "#e2554f";
  if (pct >= 80)    return "#f0a93f";
  return "#4ade80";
}

export function initials(text: string): string {
  const clean = text.replace(/@.*/, "");
  const parts = clean.split(/[.\s_\-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.substring(0, 2).toUpperCase();
}

export function statusLabel(account: { current_usage: Record<string, { usage_pct: number | null } | null> }): {
  text: string;
  variant: "ok" | "warn" | "maxed";
} {
  const pcts = Object.values(account.current_usage)
    .filter(Boolean)
    .map((u) => u!.usage_pct ?? 0);

  if (pcts.length === 0) return { text: "No data", variant: "ok" };
  const max = Math.max(...pcts);
  if (max >= 100) return { text: "Limit hit",   variant: "maxed" };
  if (max >= 80)  return { text: "Near limit",  variant: "warn" };
  return          { text: "Active",      variant: "ok" };
}
