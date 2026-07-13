import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil } from 'lucide-react';
import { patchAccount } from '../lib/api';

interface EditableNicknameProps {
  accountId: string;
  nickname: string | null;
  email: string | null;
  onUpdated: (nickname: string | null) => void;
}

export function EditableNickname({
  accountId,
  nickname,
  email,
  onUpdated,
}: EditableNicknameProps) {
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

  return (
    <div className="min-w-0 flex-1">
      <AnimatePresence mode="wait">
        {editing ? (
          <motion.input
            key="input"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.15 }}
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') {
                setValue(nickname || '');
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent border-b border-accent-primary/50 text-foreground text-sm font-semibold outline-none px-0 py-0.5"
            placeholder="Nickname..."
          />
        ) : (
          <motion.button
            key="display"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className="group/nick flex items-center gap-1.5 text-left min-w-0 cursor-text"
          >
            <span className="text-sm font-semibold text-foreground truncate group-hover/nick:text-accent-primary transition-colors duration-200">
              {displayName}
            </span>
            <Pencil className="w-2.5 h-2.5 text-muted/30 group-hover/nick:text-muted/70 transition-colors duration-200 flex-shrink-0" />
          </motion.button>
        )}
      </AnimatePresence>

      {nickname && email && email !== nickname && (
        <p className="text-[11px] text-muted/50 truncate mt-0.5">{email}</p>
      )}
    </div>
  );
}