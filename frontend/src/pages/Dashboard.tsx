import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAccounts } from '../lib/api';
import { Header } from '../components/Header';
import { AccountCard } from '../components/AccountCard';
import { MaintenanceNotes } from '../components/MaintenanceNotes';
import type { AccountWithUsage } from '../lib/types';
import { Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [accounts, setAccounts] = useState<AccountWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const navigate = useNavigate();

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
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
    );
  };

  const handleAccountClick = (id: string) => {
    navigate(`/account/${id}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header
        loading={loading}
        accountCount={accounts.length}
        lastUpdated={lastUpdated}
        onRefresh={fetchData}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="mb-8 glass rounded-xl p-4 flex items-center gap-3 border border-accent-highlight/20"
            >
              <Activity className="h-4 w-4 text-accent-highlight flex-shrink-0" />
              <span className="text-[13px] text-accent-highlight/80 flex-1">
                {error}
              </span>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={fetchData}
                className="text-[12px] text-accent-highlight/50 hover:text-accent-highlight transition-colors"
              >
                Retry
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        <AnimatePresence>
          {!loading && accounts.length === 0 && !error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-center justify-center py-24"
            >
              <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mb-5 overflow-hidden">
                <img src="/icon128.png" alt="UsageOS" className="w-9 h-9 object-contain opacity-50" />
              </div>
              <h2 className="text-lg font-semibold text-foreground/80 mb-2">
                No accounts connected
              </h2>
              <p className="text-[13px] text-muted/50 max-w-sm text-center leading-relaxed">
                Install the UsageOS Chrome extension and sign in to your Claude
                accounts to start tracking usage.
              </p>
              <motion.a
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                href="https://github.com/your-username/UsageOS"
                target="_blank"
                rel="noreferrer"
                className="mt-6 px-4 py-2 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-[13px] font-medium hover:bg-accent-primary/20 transition-colors"
              >
                View on GitHub
              </motion.a>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading State */}
        <AnimatePresence>
          {loading && accounts.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center py-24"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-border/50 border-t-accent-primary rounded-full animate-spin" />
                <p className="text-[12px] text-muted/40">Loading accounts...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Account Grid + Maintenance Notes side-by-side */}
        {accounts.length > 0 && (
          <div className="flex flex-col xl:flex-row gap-5">
            {/* Account Grid — takes remaining space */}
            <motion.div
              layout
              className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-5"
            >
              {accounts.map((account, i) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  index={i}
                  onAccountUpdated={handleAccountUpdated}
                  onNavigate={handleAccountClick}
                />
              ))}
            </motion.div>

            {/* Sticky Note — right panel, sticks while scrolling */}
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="w-full xl:w-72 flex-shrink-0"
            >
              <div className="xl:sticky xl:top-24">
                <MaintenanceNotes />
              </div>
            </motion.div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="border-t border-border/20 pt-6 text-center">
          <p className="text-[11px] font-mono text-muted/20">
            UsageOS v1.0 &middot; {accounts.length} account
            {accounts.length !== 1 ? 's' : ''} tracked
          </p>
        </div>
      </footer>
    </div>
  );
}