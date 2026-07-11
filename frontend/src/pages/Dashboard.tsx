import { useEffect, useState, useCallback } from 'react';
import { getAccounts } from '../lib/api';
import { AccountCard } from '../components/AccountCard';
import type { AccountWithUsage } from '../lib/types';
import { RefreshCw, Loader2, Activity } from 'lucide-react';

export default function Dashboard() {
  const [accounts, setAccounts] = useState<AccountWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAccounts();
      setAccounts(data || []);
      setLastUpdated(new Date());
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAccountUpdated = (id: string, patch: Partial<AccountWithUsage>) => {
    setAccounts(prev =>
      prev.map(a => (a.id === id ? { ...a, ...patch } : a))
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="flex items-end justify-between mb-10">
          <div>
            <h1 className="text-xl font-semibold text-neutral-100 tracking-tight">
              UsageOS
            </h1>
            <p className="text-[13px] text-neutral-500 mt-1">
              Multi-account Claude usage tracker
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 text-[12px] text-neutral-500 hover:text-neutral-300 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Syncing...' : 'Refresh'}
            </button>
            {lastUpdated && (
              <span className="text-[11px] font-mono text-neutral-600">
                {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
        </header>

        {error && (
          <div className="mb-8 p-4 border border-red-500/20 rounded-lg text-[13px] text-red-400 flex items-center gap-3">
            <Activity className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
            <button
              onClick={fetchData}
              className="ml-auto text-[12px] text-red-400/60 hover:text-red-400 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && accounts.length === 0 && !error && (
          <div className="text-center py-20">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full border border-white/[0.06] flex items-center justify-center">
              <Activity className="w-5 h-5 text-neutral-600" />
            </div>
            <h2 className="text-[15px] font-medium text-neutral-400 mb-2">No accounts connected</h2>
            <p className="text-[13px] text-neutral-600 max-w-sm mx-auto">
              Install the UsageOS extension and sign in to your Claude accounts to begin tracking usage.
            </p>
          </div>
        )}

        {loading && accounts.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-600" />
          </div>
        )}

        {accounts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {accounts.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                onAccountUpdated={handleAccountUpdated}
              />
            ))}
          </div>
        )}

        <footer className="mt-16 pb-8 text-center">
          <p className="text-[11px] font-mono text-neutral-700">
            UsageOS v1.0 &middot; {accounts.length} account{accounts.length !== 1 ? 's' : ''}
          </p>
        </footer>
      </div>
    </div>
  );
}
