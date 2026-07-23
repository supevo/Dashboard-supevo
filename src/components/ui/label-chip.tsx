import { readableTextColor } from '@/lib/color';

/** Renders a colored label chip with an accessible (contrast-checked) text
 *  color computed from the background. */
export function LabelChip({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${className ?? ''}`}
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      {name}
    </span>
  );
}
