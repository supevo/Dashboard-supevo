/** Content skeleton shown while an agency page's data loads. The shell/nav
 *  stays put; only the main area shows placeholders. */
export default function AgencyLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-lg border bg-muted/40" />
        ))}
      </div>
      <div className="h-40 rounded-lg border bg-muted/30" />
    </div>
  );
}
