import type { RadarSkill } from '@/features/gamification/hub';

/**
 * Lightweight pure-SVG radar (spider) chart. Values are 0–10. Renders the
 * competence skills as the primary polygon and – when passed – the user's
 * Lieblingsarbeit (work preferences) as a second overlaid polygon. The axes are
 * the union of both label sets, so you can see where competence and passion
 * overlap. Needs at least three axes to render; fewer falls back to a hint
 * handled by the caller.
 */
export function SkillRadar({
  skills,
  preferences = [],
  size = 320,
  max = 10,
}: {
  skills: RadarSkill[];
  preferences?: RadarSkill[];
  size?: number;
  max?: number;
}) {
  // Union of axes: competences first, then preference-only labels.
  const skillMap = new Map(skills.map((s) => [s.label, s.level]));
  const prefMap = new Map(preferences.map((p) => [p.label, p.level]));
  const axes: string[] = [...skillMap.keys()];
  for (const label of prefMap.keys()) if (!skillMap.has(label)) axes.push(label);

  const n = axes.length;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 56; // leave room for labels
  const rings = [0.25, 0.5, 0.75, 1];
  const hasPrefs = preferences.length > 0;

  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i: number, frac: number): [number, number] => {
    const a = angleFor(i);
    return [cx + radius * frac * Math.cos(a), cy + radius * frac * Math.sin(a)];
  };

  const gridPolygon = (frac: number) =>
    axes
      .map((_, i) => {
        const [x, y] = point(i, frac);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const seriesPolygon = (map: Map<string, number>) =>
    axes
      .map((label, i) => {
        const level = map.get(label) ?? 0;
        const [x, y] = point(i, Math.max(0, Math.min(1, level / max)));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-auto w-full max-w-[360px]">
        {/* grid rings */}
        {rings.map((frac) => (
          <polygon
            key={frac}
            points={gridPolygon(frac)}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            className="text-border"
          />
        ))}
        {/* spokes */}
        {axes.map((_, i) => {
          const [x, y] = point(i, 1);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="currentColor"
              strokeWidth={1}
              className="text-border"
            />
          );
        })}
        {/* Lieblingsarbeit area (drawn first, below the competence area) */}
        {hasPrefs && (
          <polygon
            points={seriesPolygon(prefMap)}
            fill="currentColor"
            fillOpacity={0.18}
            stroke="currentColor"
            strokeWidth={2}
            className="text-rose-500"
          />
        )}
        {/* competence area */}
        <polygon
          points={seriesPolygon(skillMap)}
          fill="currentColor"
          fillOpacity={0.25}
          stroke="currentColor"
          strokeWidth={2}
          className="text-violet-600 dark:text-violet-400"
        />
        {/* labels */}
        {axes.map((label, i) => {
          const [x, y] = point(i, 1.16);
          const anchor =
            Math.abs(x - cx) < 12 ? 'middle' : x > cx ? 'start' : 'end';
          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="fill-muted-foreground text-[10px]"
            >
              <tspan className="fill-foreground font-medium">{label}</tspan>
            </text>
          );
        })}
      </svg>

      {hasPrefs && (
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-600 dark:bg-violet-400" />
            Fähigkeiten
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
            Lieblingsarbeit
          </span>
        </div>
      )}
    </div>
  );
}
