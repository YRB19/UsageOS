import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardAccount } from "../lib/types";
import { AccountCard } from "../components/AccountCard";
import { api } from "../lib/api";

const POLL_MS = 60_000;

export function Dashboard() {
  const [accounts, setAccounts] = useState<DashboardAccount[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const timerRef                = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    try {
      const data = await api.dashboard();
      setAccounts(data.accounts);
      setLastSync(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    timerRef.current = setInterval(fetch, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetch]);

  const handleUpdate = (id: string, patch: Partial<DashboardAccount>) => {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ── Top bar ─────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#d97757] inline-block" />
          <span className="text-sm font-semibold tracking-tight">ATLAS · Claude</span>
        </div>
        <div className="flex items-center gap-4">
          {lastSync && (
            <span className="text-[11px] text-zinc-500">
              Updated {lastSync.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={fetch}
            className="text-[12px] text-zinc-400 hover:text-zinc-100 transition-colors border border-zinc-700 rounded px-3 py-1"
          >
            Refresh
          </button>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {loading && (
          <div className="text-zinc-500 text-sm text-center py-16">Loading accounts…</div>
        )}

        {error && !loading && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && accounts.length === 0 && (
          <div className="text-zinc-500 text-sm text-center py-16">
            No accounts tracked yet. Open Claude in a tab and send a message.
          </div>
        )}

        <div className="flex flex-col gap-4">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} onUpdate={handleUpdate} />
          ))}
        </div>
      </main>
    </div>
  );
}
