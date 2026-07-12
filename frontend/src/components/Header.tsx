import { motion } from 'framer-motion';
import { Zap, RefreshCw } from 'lucide-react';

interface HeaderProps {
  loading: boolean;
  accountCount: number;
  lastUpdated: Date | null;
  onRefresh: () => void;
}

export function Header({ loading, accountCount, lastUpdated, onRefresh }: HeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="sticky top-0 z-50 glass-header"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-primary/10">
            <Zap className="w-4 h-4 text-accent-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">
              UsageOS
            </h1>
            <p className="text-[11px] text-muted leading-none">
              {accountCount} account{accountCount !== 1 ? 's' : ''} tracked
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="hidden sm:block text-[11px] font-mono text-muted/60">
              {lastUpdated.toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass text-sm font-medium text-foreground/80 hover:text-foreground transition-colors disabled:opacity-40"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline">
              {loading ? 'Syncing' : 'Refresh'}
            </span>
          </motion.button>
        </div>
      </div>
    </motion.header>
  );
}