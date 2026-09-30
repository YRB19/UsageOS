import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';

interface HeaderProps {
  loading: boolean;
  accountCount: number;
  onRefresh: () => void;
}

export function Header({ loading, accountCount, onRefresh }: HeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex items-center justify-between"
    >
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          UsageOS
        </h1>
        <p className="text-[13px] text-muted mt-0.5">
          {accountCount} account{accountCount !== 1 ? 's' : ''}
        </p>
      </div>

      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={onRefresh}
        disabled={loading}
        aria-label="Refresh"
        className="w-10 h-10 rounded-[10px] bg-card flex items-center justify-center text-muted hover:text-foreground transition-colors duration-200 disabled:opacity-40 border border-black/[0.04] dark:border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      </motion.button>
    </motion.header>
  );
}