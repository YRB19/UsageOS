interface AvatarProps {
  name: string;
  color?: string;
  avatarUrl?: string | null;
  size?: number;
  gray?: boolean;
}

export function Avatar({ name, color, avatarUrl, size = 40, gray = false }: AvatarProps) {
  const boxStyle = { width: size, height: size };

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="rounded-[12px] object-cover flex-shrink-0"
        style={boxStyle}
      />
    );
  }

  return (
    <div
      aria-hidden
      className="rounded-[12px] flex items-center justify-center text-white font-medium flex-shrink-0"
      style={{
        ...boxStyle,
        backgroundColor: gray ? '#8E8E93' : color || '#8E8E93',
        fontSize: Math.round(size * 0.42),
      }}
    >
      {name?.trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
}