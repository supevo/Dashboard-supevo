/**
 * Marken-Icon des Assistenten: schwarzes „Squircle"-Gesicht mit zwei vertikalen
 * weißen Augen. Feste Farben (unabhängig vom Theme), damit das Icon überall
 * gleich aussieht. Größe über `className` (z. B. h-6 w-7) steuern.
 */
export function AssistantIcon({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 32"
      role="img"
      aria-label={title ?? 'Assistent'}
      className={className}
    >
      <rect width="40" height="32" rx="11" fill="#121316" />
      <rect x="12.5" y="8.5" width="5" height="15" rx="2.5" fill="#ffffff" />
      <rect x="22.5" y="8.5" width="5" height="15" rx="2.5" fill="#ffffff" />
    </svg>
  );
}
