import { useState, useRef, useEffect } from 'react';
import { patchAccount } from '../lib/api';

interface TelegramChatIdEditorProps {
  accountId: string;
  chatId: string | null;
  onUpdated: (chatId: string | null) => void;
}

export function TelegramChatIdEditor({ accountId, chatId, onUpdated }: TelegramChatIdEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(chatId || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = async () => {
    setEditing(false);
    const trimmed = value.trim();
    const newVal = trimmed || null;
    if (newVal === chatId) return;
    try {
      await patchAccount(accountId, { telegram_chat_id: newVal });
      onUpdated(newVal);
    } catch {
      setValue(chatId || '');
    }
  };

  const displayValue = chatId || 'Set chat ID...';

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') {
            setValue(chatId || '');
            setEditing(false);
          }
        }}
        className="bg-transparent border-b border-neutral-600 text-neutral-100 text-sm font-mono outline-none px-0 py-0 w-full max-w-[180px]"
        placeholder="e.g. 5517303024"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group/telegram flex items-center gap-1.5 text-left min-w-0 cursor-text"
    >
      <span className="text-[11px] text-neutral-500 group-hover/telegram:text-neutral-400 transition-colors flex-shrink-0">
        {chatId ? 'edit' : 'add'}
      </span>
      <span className="text-sm font-mono text-neutral-300 truncate group-hover/telegram:text-white transition-colors">
        {displayValue}
      </span>
    </button>
  );
}