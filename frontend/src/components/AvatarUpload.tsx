import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera } from 'lucide-react';
import { uploadAvatar } from '../lib/api';

interface AvatarUploadProps {
  accountId: string;
  avatarUrl: string | null;
  color: string;
  name: string;
  onUpdated: (avatarUrl: string | null) => void;
}

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_SIZE = 2 * 1024 * 1024;

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

export function AvatarUpload({ accountId, avatarUrl, color, name, onUpdated }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!ALLOWED_TYPES.has(file.type)) {
      setError('Use PNG, JPEG, or WebP');
      return;
    }
    if (file.size > MAX_SIZE) {
      setError('Max 2MB');
      return;
    }
    setUploading(true);
    try {
      const updated = await uploadAvatar(accountId, file);
      onUpdated(updated.avatar_url || null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className="w-8 h-8 rounded-lg object-cover"
        />
      ) : (
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white/90 flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {getInitials(name)}
        </div>
      )}

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={handleClick}
        className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-150"
        title="Upload avatar"
        disabled={uploading}
      >
        {uploading ? (
          <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <Camera className="w-3.5 h-3.5 text-white" />
        )}
      </motion.button>

      {error && (
        <div className="absolute top-full mt-1 left-0 text-[10px] text-accent-highlight whitespace-nowrap z-50">
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
