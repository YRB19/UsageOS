import { useState, useRef, useEffect } from 'react';
import { patchAccount } from '../lib/api';

interface EditableNicknameProps {
  accountId: string;
  nickname: string | null;
  email: string | null;
  color: string;
  onUpdated: (nickname: string | null) => void;
}

export function EditableNickname({ accountId, nickname, email, color, onUpdated }: EditableNicknameProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(nickname || '');
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
    if (newVal === nickname) return;
    try {
      await patchAccount(accountId, { nickname: newVal });
      onUpdated(newVal);
    } catch {
      setValue(nickname || '');
    }
  };

  const displayName = nickname || email || 'Unknown';

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
            setValue(nickname || '');
            setEditing(false);
          }
        }}
        className="bg-transparent border-b border-neutral-600 text-neutral-100 text-sm font-medium outline-none px-0 py-0 w-full max-w-[200px]"
        placeholder="Nickname..."
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group/nick flex items-center gap-1.5 text-left min-w-0 cursor-text"
    >
      <span
        className="inline-block w-2 h-2 rounded-full flex-shrink-0 transition-transform group-hover/nick:scale-125"
        style={{ backgroundColor: color }}
      />
      <span className="text-sm font-medium text-neutral-100 truncate group-hover/nick:text-white transition-colors">
        {displayName}
      </span>
      <span className="text-[11px] text-neutral-600 group-hover/nick:text-neutral-400 transition-colors flex-shrink-0">
        edit
      </span>
    </button>
  );
}
