import type { League } from '@/features/gamification/leagues';

/**
 * Renders a league's symbol: an uploaded image when the org set one, otherwise
 * the emoji. Size in pixels controls the image; the emoji uses the given class.
 */
export function LeagueBadge({
  league,
  size = 24,
  className,
}: {
  league: Pick<League, 'emoji' | 'iconUrl' | 'name'>;
  size?: number;
  className?: string;
}) {
  if (league.iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={league.iconUrl}
        alt={league.name}
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    );
  }
  return (
    <span className={className} aria-hidden>
      {league.emoji}
    </span>
  );
}
