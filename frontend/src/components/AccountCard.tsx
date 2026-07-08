import { useState } from "react";
import type { DashboardAccount } from "../lib/types";
import { LIMIT_ORDER } from "../lib/types";
import { initials, statusLabel } from "../lib/formatters";
import { StatusBadge } from "./StatusBadge";
import { UsageMeter } from "./UsageMeter";
import { NoteEditor } from "./NoteEditor";
import { HistoryChart } from "./HistoryChart";
import { api } from "../lib/api";

interface Props {
  account: DashboardAccount;
  onUpdate: (id: string, patch: Partial<DashboardAccount>) => void;
}

export function AccountCard({ account, onUpdate }: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nickname, setNickname]       = useState(account.nickname ?? "");

  const { text: statusText, variant } = statusLabel(account);
  const displayName = account.nickname || account.project_name || account.email.split("@")[0];
  const activeLimits = LIMIT_ORDER.filter((k) => account.current_usage[k]);

  const saveNickname = async () => {
    setEditingName(false);
    if (nickname === (account.nickname ?? "")) return;
    await api.patchAccount(account.id, { nickname });
    onUpdate(account.id, { nickname });
  };

  return (
    <div
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-0"
      style={{ borderLeftColor: account.color, borderLeftWidth: 3 }}
    >
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
          style={{ background: account.color + "33", color: account.color }}
        >
          {initials(account.email)}
        </div>

        {/* Name + email */}
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onBlur={saveNickname}
              onKeyDown={(e) => e.key === "Enter" && saveNickname()}
              className="bg-transparent text-sm font-semibold text-zinc-100 border-b border-zinc-600 outline-none w-full"
            />
          ) : (
            <div
              className="text-sm font-semibold text-zinc-100 cursor-pointer hover:text-white truncate"
              title="Click to rename"
              onClick={() => setEditingName(true)}
            >
              {displayName}
            </div>
          )}
          <div className="text-xs text-zinc-500 truncate">{account.email}</div>
        </div>

        <StatusBadge text={statusText} variant={variant} />
      </div>

      {/* ── Usage meters ────────────────────────────── */}
      {activeLimits.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-3">
          {activeLimits.map((key) => (
            <UsageMeter key={key} limitType={key} data={account.current_usage[key]!} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-600 mb-3">No usage data yet — open Claude and send a message.</p>
      )}

      {/* ── History toggle ──────────────────────────── */}
      <button
        onClick={() => setShowHistory((v) => !v)}
        className="self-start text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors mb-1"
      >
        {showHistory ? "▾ Hide history" : "▸ 7-day history"}
      </button>

      {showHistory && (
        <HistoryChart accountId={account.id} color={account.color} />
      )}

      {/* ── Notes ──────────────────────────────────── */}
      <NoteEditor accountId={account.id} initialContent={account.note} />
    </div>
  );
}
