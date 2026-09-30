import type { AccountWithUsage, UsageLimit } from './types';

export function formatCountdown(resetsAt: string | null): string {
  if (!resetsAt) return '';
  const diff = new Date(resetsAt).getTime() - Date.now();
  if (diff <= 0) return 'Resetting\u2026';

  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);

  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatResetTime(resetsAt: string | null): string {
  if (!resetsAt) return '';
  return new Date(resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function pctColor(pct: number | null): string {
  if (pct === null) return '#a7a9be';
  if (pct >= 100) return '#f25f4c';
  if (pct >= 80) return '#ff8906';
  return '#22c55e';
}

export function initials(email: string | null): string {
  if (!email) return '?';
  const clean = email.replace(/@.*/, '');
  const parts = clean.split(/[.\s_\-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.substring(0, 2).toUpperCase();
}

export function statusVariant(pct: number): 'ok' | 'warn' | 'maxed' {
  if (pct >= 100) return 'maxed';
  if (pct >= 80) return 'warn';
  return 'ok';
}

export function effectivePct(usage_pct: number, resets_at: string | null): number {
  if (!resets_at) return usage_pct;
  const resetTime = new Date(resets_at).getTime();
  if (Date.now() >= resetTime) return 0;
  return usage_pct;
}

export function usageColor(pct: number): string {
  if (pct >= 95) return '#FF453A';
  if (pct >= 80) return '#FF9500';
  return '#007AFF';
}

export function formatResetLine(resetsAt: string | null): string {
  if (!resetsAt) return '';
  const d = new Date(resetsAt);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Resets today, ${time}`;
  const weekday = d.toLocaleDateString([], { weekday: 'short' });
  return `Resets ${weekday} ${time}`;
}

export function formatChartDateLabel(value: number): string {
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatFullDateTime(value: number): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export interface CardSummary {
  pct: number;
  atLimit: boolean;
  sessionActive: boolean;
  resetText: string | null;
  weeklyPct: number | null;
  syncedAgo: string | null;
  stale: boolean;
}

const DAY_MS = 24 * 3_600_000;

function timeAgoLabel(diff: number): string {
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function latestSync(limits: UsageLimit[]): { ms: number; ago: string } | null {
  let last: number | null = null;
  for (const l of limits) {
    if (l.updated_at) {
      const t = new Date(l.updated_at).getTime();
      if (!Number.isNaN(t) && (last === null || t > last)) last = t;
    }
  }
  if (last === null) return null;
  return { ms: last, ago: timeAgoLabel(Math.max(0, Date.now() - last)) };
}

export function summarizeAccount(account: AccountWithUsage): CardSummary {
  const session = account.limits.find((l) => l.limit_type === 'session');
  const weekly = account.limits.find((l) => l.limit_type === 'weekly');

  const eff = (l: UsageLimit) => effectivePct(l.usage_pct ?? 0, l.resets_at);

  const pct = session
    ? eff(session)
    : account.limits.length > 0
      ? Math.max(...account.limits.map(eff))
      : 0;

  const clamped = Math.max(0, Math.min(100, pct));
  const resetText =
    session && session.resets_at && new Date(session.resets_at).getTime() > Date.now()
      ? formatCountdown(session.resets_at)
      : null;
  const sync = latestSync(account.limits);

  return {
    pct: clamped,
    atLimit: clamped >= 100,
    sessionActive: resetText !== null,
    resetText,
    weeklyPct: weekly ? eff(weekly) : null,
    syncedAgo: sync ? sync.ago : null,
    stale: sync !== null && Date.now() - sync.ms > DAY_MS,
  };
}