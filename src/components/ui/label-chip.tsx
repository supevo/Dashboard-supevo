import { readableTextColor } from '@/lib/color';

/** Renders a colored label chip with an accessible (contrast-checked) text
 *  color computed from the background. `intensity` 2 = strong: a pulsing
 *  highlight that draws the eye (also shown to clients in the portal). */
export function LabelChip({
  name,
  color,
  intensity = 1,
  className,
}: {
  name: string;
  color: string;
  intensity?: number;
  className?: string;
}) {
  const strong = intensity >= 2;
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
        strong ? 'label-pulse font-semibold' : ''
      } ${className ?? ''}`}
      style={
        {
          backgroundColor: color,
          color: readableTextColor(color),
          ...(strong ? { '--label-glow': color } : {}),
        } as React.CSSProperties
      }
    >
      {name}
    </span>
  );
}
