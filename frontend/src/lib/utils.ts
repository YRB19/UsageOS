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
  if (pct === null) return '#6b7280';
  if (pct >= 100) return '#ef4444';
  if (pct >= 80) return '#f59e0b';
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
