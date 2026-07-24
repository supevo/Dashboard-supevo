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
export function Avatar({
  userId,
  name,
  hasAvatar,
  size = 'md',
  className,
  bust,
}: {
  userId: string;
  name: string;
  hasAvatar: boolean;
  size?: keyof typeof SIZES;
  className?: string;
  /** Cache-busting token; change it to force the browser to reload the image. */
  bust?: number;
}) {
  const base = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 font-medium text-primary',
    SIZES[size],
    className,
  );

  if (hasAvatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/profiles/${userId}/avatar${bust ? `?v=${bust}` : ''}`}
        alt={name}
        title={name}
        className={cn(base, 'object-cover')}
      />
    );
  }

  return (
    <span className={base} title={name} aria-label={name}>
      {initials(name)}
    </span>
  );
}
