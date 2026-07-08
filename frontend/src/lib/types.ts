export interface CurrentUsage {
  limit_type: string;
  usage_pct: number | null;
  resets_at: string | null;
  updated_at: string;
}

export interface DashboardAccount {
  id: string;
  email: string;
  nickname: string | null;
  project_name: string | null;
  color: string;
  subscription_tier: string | null;
  last_seen_at: string | null;
  current_usage: Record<string, CurrentUsage | null>;
  note: string;
}

export interface SnapshotPoint {
  recorded_at: string;
  usage_pct: number;
  resets_at: string | null;
}

export const LIMIT_LABELS: Record<string, string> = {
  session:       "Session",
  weekly:        "Weekly",
  sonnet_weekly: "Sonnet",
  opus_weekly:   "Opus",
};

export const LIMIT_ORDER = ["session", "weekly", "sonnet_weekly", "opus_weekly"];
