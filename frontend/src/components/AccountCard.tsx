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

interface NotificationPrefs {
  notify_telegram: boolean;
  telegram_chat_id: string;
  notify_whatsapp: boolean;
  whatsapp_number: string;
  notify_reset: boolean;
  notify_threshold: number | null;
}

function NotificationSettings({ account, onUpdate }: { account: DashboardAccount; onUpdate: (id: string, patch: Partial<DashboardAccount>) => void }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    notify_telegram: account.notify_telegram,
    telegram_chat_id: account.telegram_chat_id || "",
    notify_whatsapp: account.notify_whatsapp,
    whatsapp_number: account.whatsapp_number || "",
    notify_reset: account.notify_reset,
    notify_threshold: account.notify_threshold || 0.9,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const savePrefs = async () => {
    setSaving(true);
    try {
      await api.patchAccount(account.id, {
        notify_telegram: prefs.notify_telegram,
        telegram_chat_id: prefs.telegram_chat_id || null,
        notify_whatsapp: prefs.notify_whatsapp,
        whatsapp_number: prefs.whatsapp_number || null,
        notify_reset: prefs.notify_reset,
        notify_threshold: prefs.notify_threshold || null,
      });
      onUpdate(account.id, prefs);
    } catch (e) {
      console.error("Failed to save notification prefs", e);
    } finally {
      setSaving(false);
    }
  };

  const testNotification = async (type: "telegram" | "whatsapp") => {
    setTesting(type);
    try {
      await api.testNotification(account.id, type);
      alert(`${type} test sent successfully!`);
    } catch (e: any) {
      alert(`Failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="border-t border-zinc-800 pt-4 mt-4 space-y-4">
      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Notifications</h4>

      <div className="grid gap-3 text-sm">
        {/* Telegram */}
        <div className="space-y-2 p-3 bg-zinc-800/50 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.notify_telegram}
              onChange={(e) => setPrefs({ ...prefs, notify_telegram: e.target.checked })}
              className="w-4 h-4 accent-orange-500"
            />
            <span className="font-medium text-zinc-100">Telegram</span>
          </label>
          {prefs.notify_telegram && (
            <div className="space-y-2 pl-6">
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Chat ID</label>
                <input
                  type="text"
                  value={prefs.telegram_chat_id}
                  onChange={(e) => setPrefs({ ...prefs, telegram_chat_id: e.target.value })}
                  placeholder="123456789"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[12px] text-zinc-100 focus:border-orange-500 focus:outline-none"
                />
                <p className="text-[10px] text-zinc-600 mt-1">Get this from @userinfobot on Telegram</p>
              </div>
              <button
                onClick={() => testNotification("telegram")}
                disabled={testing === "telegram" || saving || !prefs.telegram_chat_id}
                className="text-[11px] px-3 py-1 border border-zinc-700 rounded hover:border-orange-500 text-orange-500 hover:bg-orange-500/10 disabled:opacity-50"
              >
                {testing === "telegram" ? "Sending..." : "Send Test"}
              </button>
            </div>
          )}
        </div>

        {/* WhatsApp */}
        <div className="space-y-2 p-3 bg-zinc-800/50 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.notify_whatsapp}
              onChange={(e) => setPrefs({ ...prefs, notify_whatsapp: e.target.checked })}
              className="w-4 h-4 accent-green-500"
            />
            <span className="font-medium text-zinc-100">WhatsApp (Twilio)</span>
          </label>
          {prefs.notify_whatsapp && (
            <div className="space-y-2 pl-6">
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={prefs.whatsapp_number}
                  onChange={(e) => setPrefs({ ...prefs, whatsapp_number: e.target.value })}
                  placeholder="+15551234567"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[12px] text-zinc-100 focus:border-green-500 focus:outline-none"
                />
                <p className="text-[10px] text-zinc-600 mt-1">Include country code (e.g., +1 for US)</p>
              </div>
              <button
                onClick={() => testNotification("whatsapp")}
                disabled={testing === "whatsapp" || saving || !prefs.whatsapp_number}
                className="text-[11px] px-3 py-1 border border-zinc-700 text-green-500 hover:bg-green-500/10 disabled:opacity-50"
              >
                {testing === "whatsapp" ? "Sending..." : "Send Test"}
              </button>
            </div>
          )}
        </div>

        {/* General settings */}
        <div className="space-y-2 p-3 bg-zinc-800/50 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.notify_reset}
              onChange={(e) => setPrefs({ ...prefs, notify_reset: e.target.checked })}
              className="w-4 h-4 accent-zinc-500"
            />
            <span className="font-medium text-zinc-100">Notify when limits reset</span>
          </label>

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">
              Threshold alert: {Math.round((prefs.notify_threshold || 0.9) * 100)}%
            </label>
            <input
              type="range"
              min="0.5"
              max="1"
              step="0.05"
              value={prefs.notify_threshold || 0.9}
              onChange={(e) => setPrefs({ ...prefs, notify_threshold: parseFloat(e.target.value) })}
              className="w-full accent-orange-500"
            />
            <p className="text-[10px] text-zinc-600 mt-1">Notify when usage exceeds this percentage</p>
          </div>
        </div>

        <button
          onClick={savePrefs}
          disabled={saving}
          className="w-full py-2 bg-orange-500 text-zinc-900 font-semibold rounded-lg hover:bg-orange-400 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : "Save Notification Settings"}
        </button>
      </div>
    </div>
  );
}

export function AccountCard({ account, onUpdate }: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nickname, setNickname]       = useState(account.nickname ?? "");
  const [showNotifications, setShowNotifications] = useState(false);

  const { text: statusText, variant } = statusLabel(account);
  const displayName = account.nickname || account.project_name || account.email.split("@")[0];
  const activeLimits = LIMIT_ORDER.filter((k) => account.current_usage[k]);

  const saveNickname = async () => {
    setEditingName(false);
    if (nickname === (account.nickname ?? "")) return;
    await api.patchAccount(account.id, { nickname });
    onUpdate(account.id, { nickname });
  };

  const handleReset = () => {
    // Trigger parent to refetch - this will be handled by Dashboard's checkForResets
    // but we can also force an immediate refetch here if needed
    onUpdate(account.id, {}); // trigger re-render
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
            <UsageMeter key={key} limitType={key} data={account.current_usage[key]!} onReset={handleReset} />
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

      {/* ── Notifications toggle ────────────────────── */}
      <button
        onClick={() => setShowNotifications((v) => !v)}
        className="self-start text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors mb-1"
      >
        {showNotifications ? "▾ Hide notifications" : "▸ Notification settings"}
      </button>

      {showNotifications && (
        <NotificationSettings account={account} onUpdate={onUpdate} />
      )}

      {/* ── Notes ──────────────────────────────────── */}
      <NoteEditor accountId={account.id} initialContent={account.note} />
    </div>
  );
}