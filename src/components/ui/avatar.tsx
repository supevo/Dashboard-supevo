import { cn } from '@/lib/utils';

/** Two-letter initials derived from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const SIZES = {
  sm: 'h-5 w-5 text-[9px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-16 w-16 text-lg',
} as const;

/**
 * Round avatar. Shows the user's picture (served via the avatar API) when
 * `hasAvatar`, otherwise falls back to coloured initials. Rendered in a Server
 * or Client Component; the image is a plain <img> pointing at our redirecting
 * avatar route, so the browser caches it.
 */
const STATUS_DOT: Record<string, { color: string; label: string }> = {
  online: { color: 'bg-emerald-500', label: 'Online' },
  afk: { color: 'bg-amber-500', label: 'Abwesend' },
  dnd: { color: 'bg-rose-500', label: 'Nicht stören' },
};

export function Avatar({
  userId,
  name,
  hasAvatar,
  size = 'md',
  className,
  bust,
  status,
}: {
  userId: string;
  name: string;
  hasAvatar: boolean;
  size?: keyof typeof SIZES;
  className?: string;
  /** Cache-busting token; change it to force the browser to reload the image. */
  bust?: number;
  /** Presence status → small coloured dot on the avatar. */
  status?: string | null;
}) {
  const base = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 font-medium text-primary',
    SIZES[size],
    className,
  );

  const inner = hasAvatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/profiles/${userId}/avatar${bust ? `?v=${bust}` : ''}`}
      alt={name}
      title={name}
      className={cn(base, 'object-cover')}
    />
  ) : (
    <span className={base} title={name} aria-label={name}>
      {initials(name)}
    </span>
  );

  const dot = status ? STATUS_DOT[status] : undefined;
  if (!dot) return inner;

  return (
    <span className="relative inline-flex shrink-0">
      {inner}
      <span
        title={dot.label}
        aria-label={dot.label}
        className={cn(
          'absolute bottom-0 right-0 rounded-full ring-2 ring-background',
          size === 'sm' ? 'h-2 w-2' : size === 'lg' ? 'h-4 w-4' : 'h-2.5 w-2.5',
          dot.color,
        )}
      />
    </span>
  );
}
