export interface Account {
  id: string;
  provider: string;
  email: string | null;
  org_id: string;
  nickname: string | null;
  color: string;
  telegram_chat_id: string | null;
  subscription_tier: string | null;
  avatar_url: string | null;
  note: string | null;
  created_at: string;
}

export interface UsageLimit {
  limit_type: string;
  usage_pct: number;
  resets_at: string | null;
  updated_at: string;
}

export interface AccountWithUsage extends Account {
  limits: UsageLimit[];
}

export interface SyncEvent {
  id: string;
  org_id: string;
  email: string | null;
  subscription_tier: string | null;
  limits: Record<string, { usage_pct: number | null; resets_at: string | null } | null>;
  timestamp: string;
}

export interface NoteResponse {
  content: string;
  updated_at: string | null;
}

export interface MaintenanceNoteResponse {
  content: string;
  updated_at: string | null;
}

export const LIMIT_LABELS: Record<string, string> = {
  session: 'Session',
  weekly: 'Weekly',
  sonnet_weekly: 'Sonnet Weekly',
  opus_weekly: 'Opus Weekly',
};

export const LIMIT_ORDER: string[] = ['session', 'weekly', 'sonnet_weekly', 'opus_weekly'];

export const PRESET_COLORS = [
  '#ff8906',
  '#f25f4c',
  '#e53170',
  '#6366f1',
  '#8b5cf6',
  '#22c55e',
  '#06b6d4',
  '#eab308',
];