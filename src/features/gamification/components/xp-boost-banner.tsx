import type { ActiveXpBoost } from '@/features/gamification/xp-boost';

function untilLabel(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return '';
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `noch ${Math.max(1, h)} Std.`;
  const d = Math.floor(h / 24);
  return `noch ${d} ${d === 1 ? 'Tag' : 'Tage'}`;
}

/** Prominent strip announcing a running XP boost (Double-XP-Woche). */
export function XpBoostBanner({ boost }: { boost: ActiveXpBoost | null }) {
  if (!boost) return null;
  const bg = boost.bannerUrl
    ? `url("${boost.bannerUrl}") center / cover no-repeat`
    : 'linear-gradient(120deg, #f59e0b 0%, #ef4444 55%, #b91c1c 100%)';

  return (
    <div className="relative overflow-hidden rounded-lg border">
      <div aria-hidden className="absolute inset-0" style={{ background: bg }} />
      <div aria-hidden className="absolute inset-0 bg-black/35" />
      <div className="relative flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="text-lg font-bold">⚡ {boost.title}</div>
          <div className="text-xs opacity-90">
            {untilLabel(boost.endsAt)} · alle XP zählen {boost.factor}×
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white/90 px-3 py-1 text-sm font-extrabold text-amber-600">
          {boost.factor}× XP
        </span>
      </div>
    </div>
  );
}
