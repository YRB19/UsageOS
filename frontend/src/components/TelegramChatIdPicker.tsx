import { useState, useRef, useEffect } from 'react';
import { patchAccount } from '../lib/api';

interface TelegramChatIdPickerProps {
  accountId: string;
  chatId: string | null;
  onUpdated: (chatId: string | null) => void;
}

export function TelegramChatIdPicker({ accountId, chatId, onUpdated }: TelegramChatIdPickerProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(chatId || '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const save = async () => {
    const trimmed = value.trim();
    const newVal = trimmed || null;
    if (newVal === chatId) {
      setEditing(false);
      setOpen(false);
      return;
    }
    try {
      await patchAccount(accountId, { telegram_chat_id: newVal });
      onUpdated(newVal);
    } catch { /* ignore */ }
    setEditing(false);
    setOpen(false);
  };

  const cancel = () => {
    setValue(chatId || '');
    setEditing(false);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          if (!editing) setOpen(!open);
        }}
        className={`w-5 h-5 rounded border transition-colors flex-shrink-0 ${
          chatId
            ? 'bg-green-500/20 border-green-500/30'
            : 'border-white/10 hover:border-white/20'
        }`}
        title={chatId ? `Chat ID: ${chatId}` : 'Set Telegram Chat ID'}
      >
        {chatId && <span className="w-full h-full flex items-center justify-center text-[10px] font-mono text-green-400">✓</span>}
      </button>
      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 bg-neutral-900 border border-white/10 rounded-lg p-3 shadow-xl w-64">
          <p className="text-[11px] text-neutral-500 mb-2">Telegram Chat ID</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') cancel();
              }}
              onBlur={save}
              placeholder="e.g. 5517303024"
              className="flex-1 bg-neutral-800 border border-white/10 rounded px-2 py-1 text-[13px] text-neutral-100 outline-none focus:border-blue-500/50"
              autoFocus
            />
            <button
              onClick={save}
              className="px-2 py-1 text-[11px] bg-blue-500/20 border border-blue-500/30 rounded hover:bg-blue-500/30 transition-colors"
            >
              Save
            </button>
          </div>
          <p className="text-[10px] text-neutral-600 mt-2">
            Get your chat ID by messaging your bot, then visiting:{' '}
            <code className="text-neutral-400">api.telegram.org/bot{"<"}TOKEN{">"}/getUpdates</code>
          </p>
        </div>
      )}
    </div>
  );
}