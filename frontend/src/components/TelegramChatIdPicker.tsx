import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Copy, Check } from 'lucide-react';
import { patchAccount } from '../lib/api';

interface TelegramChatIdPickerProps {
  accountId: string;
  chatId: string | null;
  onUpdated: (chatId: string | null) => void;
}

export function TelegramChatIdPicker({
  accountId,
  chatId,
  onUpdated,
}: TelegramChatIdPickerProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(chatId || '');
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const save = async () => {
    const trimmed = value.trim();
    const newVal = trimmed || null;
    if (newVal === chatId) {
      setOpen(false);
      return;
    }
    try {
      await patchAccount(accountId, { telegram_chat_id: newVal });
      onUpdated(newVal);
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const cancel = () => {
    setValue(chatId || '');
    setOpen(false);
  };

  const handleCopyChatId = () => {
    navigator.clipboard.writeText(chatId || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative" ref={ref}>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`flex items-center justify-center w-6 h-6 rounded-md transition-all duration-200 ${
          chatId
            ? 'bg-accent-primary/15 text-accent-primary'
            : 'text-muted/30 hover:text-muted/60 hover:bg-white/5'
        }`}
        title={chatId ? `Linked: ${chatId}` : 'Link Telegram'}
      >
        <MessageCircle className="w-3.5 h-3.5" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={cancel}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="glass rounded-xl p-4 shadow-2xl w-full max-w-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-foreground/80">
                    Telegram Notifications
                  </h4>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      cancel();
                    }}
                    className="text-muted/40 hover:text-muted/80 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {chatId && (
                  <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20">
                    <span className="text-[11px] font-mono text-accent-primary truncate flex-1">
                      {chatId}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyChatId();
                      }}
                      className="text-accent-primary/60 hover:text-accent-primary transition-colors"
                    >
                      {copied ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') save();
                      if (e.key === 'Escape') cancel();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Chat ID..."
                    className="flex-1 glass-input rounded-lg px-3 py-2 text-[13px] text-foreground placeholder-muted/40 outline-none focus:ring-1 focus:ring-accent-primary/40 transition-all duration-200"
                  />
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      save();
                    }}
                    className="px-3 py-2 text-[11px] font-medium bg-accent-primary/20 border border-accent-primary/30 rounded-lg text-accent-primary hover:bg-accent-primary/30 transition-colors"
                  >
                    Link
                  </motion.button>
                </div>

                <p className="text-[10px] text-muted/30 mt-2.5 leading-relaxed">
                  Message{' '}
                  <code className="text-muted/50">@usageOS_bot</code>{' '}
                  with <code className="text-muted/50">/start</code> to get your chat ID.
                </p>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}