/**
 * Presence freshness. profiles.status only holds the last chosen state
 * (online/afk/dnd) and never flips to offline on its own. So at read time we
 * treat presence as OFFLINE when the last heartbeat is too old (tab closed /
 * logged off). The client heartbeat fires every 90s while the tab is open.
 */
export const PRESENCE_STALE_MS = 4 * 60_000; // ~2 missed heartbeats → offline

/**
 * The presence to actually show: the stored status if the last heartbeat is
 * recent enough, otherwise null (offline). Also offline when never seen.
 */
export function livePresence(
  status: string | null | undefined,
  lastSeenAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!status || !lastSeenAt) return null;
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen) || nowMs - seen > PRESENCE_STALE_MS) return null;
  return status;
}
