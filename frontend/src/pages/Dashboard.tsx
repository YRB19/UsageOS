import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, ChevronRight } from 'lucide-react';
import { getAccounts } from '../lib/api';
import { Header } from '../components/Header';
import { AccountCard } from '../components/AccountCard';
import { Avatar } from '../components/Avatar';
import { MaintenanceNotes } from '../components/MaintenanceNotes';
import { summarizeAccount } from '../lib/utils';
import type { AccountWithUsage } from '../lib/types';
import { useNavigate } from 'react-router-dom';

function WaitingList({ accounts, onNavigate }: { accounts: AccountWithUsage[]; onNavigate: (id: string) => void }) {
  return (
    <div className="bg-card rounded-[20px] p-4 border border-black/[0.02] dark:border-white/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]">
      <h2 className="text-[13px] font-semibold text-foreground px-1 pb-2">
        Waiting for first sync ({accounts.length})
      </h2>
      <ul className="divide-y divide-border/40">
        {accounts.map((a) => {
          const name = a.nickname || a.email || 'Unknown';
          return (
            <li key={a.id}>
              <button
                onClick={() => onNavigate(a.id)}
                className="w-full flex items-center gap-3 px-1 py-2.5 text-left rounded-[10px] hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors duration-150"
              >
                <Avatar name={name} gray size={34} avatarUrl={a.avatar_url} />
                <span className="text-[14px] text-foreground min-w-0 truncate">{name}</span>
                {a.email && (
                  <span className="text-[13px] text-muted min-w-0 truncate">{a.email}</span>
                )}
                <ChevronRight className="w-4 h-4 text-muted/60 ml-auto flex-shrink-0" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<AccountWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAccounts();
      setAccounts(data || []);
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

  const handleAccountClick = (id: string) => {
    navigate(`/account/${id}`);
  };

  const synced = accounts.filter((a) => a.limits.length > 0);
  const waiting = accounts.filter((a) => a.limits.length === 0);
  const sorted = [...synced].sort((a, b) => {
    const sa = summarizeAccount(a);
    const sb = summarizeAccount(b);
    if (sa.atLimit !== sb.atLimit) return sa.atLimit ? -1 : 1;
    return sb.pct - sa.pct;
  });

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <Header loading={loading} accountCount={accounts.length} onRefresh={fetchData} />

        <main className="mt-8">
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="mb-8 rounded-[10px] p-4 flex items-center gap-3 border border-accent-highlight/20 bg-accent-highlight/10"
              >
                <Activity className="h-4 w-4 text-accent-highlight flex-shrink-0" />
                <span className="text-[13px] text-accent-highlight flex-1">{error}</span>
                <button
                  onClick={fetchData}
                  className="text-[12px] text-accent-highlight/80 hover:text-accent-highlight transition-colors"
                >
                  Retry
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col lg:flex-row items-start gap-6">
            <div className="flex-1 min-w-0 space-y-6">
              {loading && accounts.length === 0 ? (
                <div className="flex items-center justify-center py-24">
                  <div className="w-8 h-8 border-2 border-border/50 border-t-accent-primary rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {sorted.length === 0 ? (
                    <p className="text-[15px] text-muted py-14 px-1">Waiting for your first sync</p>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
                      {sorted.map((account) => (
                        <AccountCard
                          key={account.id}
                          account={account}
                          onNavigate={handleAccountClick}
                        />
                      ))}
                    </div>
                  )}

                  {waiting.length > 0 && (
                    <WaitingList accounts={waiting} onNavigate={handleAccountClick} />
                  )}
                </>
              )}
            </div>

            <aside className="w-full lg:w-80 flex-shrink-0">
              <MaintenanceNotes />
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}