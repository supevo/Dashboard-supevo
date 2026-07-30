'use client';

/** "… schreibt" line with an animated three-dot pulse. Renders nothing when idle. */
export function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const label =
    names.length === 1
      ? `${names[0]} schreibt`
      : names.length === 2
        ? `${names[0]} und ${names[1]} schreiben`
        : `${names.length} Personen schreiben`;

  return (
    <div className="flex items-center gap-1.5 px-3 pb-1 text-xs text-muted-foreground">
      <span className="flex gap-0.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
      </span>
      <span className="truncate">{label} …</span>
    </div>
  );
}
