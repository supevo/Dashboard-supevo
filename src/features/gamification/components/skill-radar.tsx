import type { RadarSkill } from '@/features/gamification/hub';

/**
 * Lightweight pure-SVG radar (spider) chart for the competence skills. Values
 * are 0–10. Needs at least three axes to render a polygon; fewer falls back to
 * a hint handled by the caller.
 */
export function SkillRadar({
  skills,
  size = 320,
  max = 10,
}: {
  skills: RadarSkill[];
  size?: number;
  max?: number;
}) {
  const n = skills.length;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 56; // leave room for labels
  const rings = [0.25, 0.5, 0.75, 1];

  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i: number, frac: number): [number, number] => {
    const a = angleFor(i);
    return [cx + radius * frac * Math.cos(a), cy + radius * frac * Math.sin(a)];
  };

  const gridPolygon = (frac: number) =>
    skills
      .map((_, i) => {
        const [x, y] = point(i, frac);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const valuePolygon = skills
    .map((s, i) => {
      const [x, y] = point(i, Math.max(0, Math.min(1, s.level / max)));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
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
      {skills.map((_, i) => {
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
      {/* value area */}
      <polygon
        points={valuePolygon}
        fill="currentColor"
        fillOpacity={0.25}
        stroke="currentColor"
        strokeWidth={2}
        className="text-primary"
      />
      {/* labels */}
      {skills.map((s, i) => {
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
            <tspan className="fill-foreground font-medium">{s.label}</tspan>
            <tspan dx="4">{s.level}/{max}</tspan>
          </text>
        );
      })}
    </svg>
  );
}
