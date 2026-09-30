import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { AvatarUpload } from './AvatarUpload';
import { EditableNickname } from './EditableNickname';
import { ColorPicker } from './ColorPicker';
import { TelegramChatIdPicker } from './TelegramChatIdPicker';
import type { AccountWithUsage } from '../lib/types';

interface EditPanelProps {
  open: boolean;
  onClose: () => void;
  account: AccountWithUsage;
  onUpdated: (patch: Partial<AccountWithUsage>) => void;
}

function EditRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-muted mb-2">{label}</div>
      <div className="flex items-center min-h-8">{children}</div>
    </div>
  );
}

export function EditPanel({ open, onClose, account, onUpdated }: EditPanelProps) {
  const displayName = account.nickname || account.email || 'Unknown';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px]"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            onClick={(e) => e.stopPropagation()}
            className="fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-card border-l border-border/40 shadow-2xl p-6 overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-[15px] font-semibold text-foreground">Edit</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 rounded-[10px] flex items-center justify-center text-muted hover:text-foreground hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-7">
              <EditRow label="Nickname">
                <EditableNickname
                  accountId={account.id}
                  nickname={account.nickname}
                  email={account.email}
                  onUpdated={(n) => onUpdated({ nickname: n })}
                />
              </EditRow>

              <EditRow label="Color">
                <ColorPicker
                  accountId={account.id}
                  color={account.color}
                  onUpdated={(c) => onUpdated({ color: c })}
                />
              </EditRow>

              <EditRow label="Avatar">
                <AvatarUpload
                  accountId={account.id}
                  avatarUrl={account.avatar_url}
                  color={account.color}
                  name={displayName}
                  onUpdated={(url) => onUpdated({ avatar_url: url })}
                />
              </EditRow>

              <EditRow label="Telegram">
                <TelegramChatIdPicker
                  accountId={account.id}
                  chatId={account.telegram_chat_id}
                  onUpdated={(c) => onUpdated({ telegram_chat_id: c })}
                />
              </EditRow>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}