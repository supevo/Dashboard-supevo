/** Content skeleton shown while a portal page's data loads. */
export default function PortalLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-40 rounded bg-muted" />
      <div className="h-24 rounded-lg border bg-muted/40" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg border bg-muted/40" />
        ))}
      </div>
      <div className="h-40 rounded-lg border bg-muted/30" />
    </div>
  );
}
