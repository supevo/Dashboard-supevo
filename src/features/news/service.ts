import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { completeText } from '@/lib/ai/complete';
import { logger } from '@/lib/logger';
import {
  fetchRssItems,
  fetchOgImage,
  resolveArticleUrl,
  googleNewsUrl,
  type NewsItem,
} from './rss';
import { berlinToday } from '@/lib/time';

const MAX_ITEMS = 6;
const MAX_BRANDS = 5;

export interface ClientNews {
  items: NewsItem[];
  fetchedAt: string | null;
  topic: string;
}

/** Splits the free-text brands field into a clean list of brand names. */
function parseBrands(brands: string | null): string[] {
  return (brands ?? '')
    .split(/[,;\n]/)
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * Builds the news search queries from the client's industry + brands +
 * interests/target group. One query per brand and per interest (so each gets its
 * own headlines instead of only the first), plus a human-readable label for the
 * UI. Falls back to industry/name when nothing specific is set.
 */
function buildTopics(company: {
  industry: string | null;
  brands: string | null;
  interests: string | null;
  name: string | null;
}): { queries: string[]; label: string } {
  const industry = (company.industry ?? '').trim();
  const brands = parseBrands(company.brands);
  const interests = parseBrands(company.interests);
  // Marken zuerst, dann Interessen/Zielgruppen – zusammen begrenzt.
  const seeds = [...brands, ...interests].slice(0, MAX_BRANDS);
  if (seeds.length > 0) {
    const queries = seeds.map((s) => (industry ? `${industry} ${s}` : s));
    return { queries, label: seeds.join(', ') };
  }
  const fallback = industry || company.name || 'Marketing';
  return { queries: [fallback], label: fallback };
}

/**
 * Merges several per-brand feeds into one balanced list: round-robin picks the
 * newest item from each brand in turn, so no single brand dominates. De-dupes by
 * URL and normalised title.
 */
function mergeBalanced(feeds: NewsItem[][], max: number): NewsItem[] {
  const lists = feeds.map((f) =>
    f
      .slice()
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')),
  );
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  const key = (it: NewsItem) => (it.url || it.title).toLowerCase();
  const titleKey = (it: NewsItem) =>
    `t:${it.title.toLowerCase().replace(/\s+/g, ' ').trim()}`;

  for (let round = 0; out.length < max; round++) {
    let progressed = false;
    for (const list of lists) {
      const it = list[round];
      if (!it) continue;
      progressed = true;
      if (seen.has(key(it)) || seen.has(titleKey(it))) continue;
      seen.add(key(it));
      seen.add(titleKey(it));
      out.push(it);
      if (out.length >= max) break;
    }
    if (!progressed) break;
  }
  return out;
}

/**
 * AI picks the most relevant, useful headlines for the client's topic and drops
 * off-topic/duplicate ones. Falls back to the newest items when AI is off/fails.
 */
async function curate(items: NewsItem[], topic: string): Promise<NewsItem[]> {
  const byDate = items
    .slice()
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  if (byDate.length <= MAX_ITEMS) return byDate;

  const list = byDate
    .slice(0, 20)
    .map((it, i) => `${i}: ${it.title} (${it.source})`)
    .join('\n');
  const result = await completeText({
    system: `Du kuratierst Branchen-News für einen Marketing-Kunden zum Thema "${topic}".
Wähle die ${MAX_ITEMS} relevantesten, seriösesten und aktuellsten Schlagzeilen aus (keine Dubletten, kein Clickbait, nichts Themenfremdes).
Antworte AUSSCHLIESSLICH mit JSON: { "top": [Indizes] } – Indizes aus der Liste, wichtigste zuerst.`,
    prompt: `Thema: ${topic}\n\nSchlagzeilen:\n${list}`,
    maxTokens: 200,
  });
  if (!result) return byDate.slice(0, MAX_ITEMS);
  try {
    const raw = result.text.slice(result.text.indexOf('{'), result.text.lastIndexOf('}') + 1);
    const parsed = JSON.parse(raw) as { top?: unknown };
    if (!Array.isArray(parsed.top)) return byDate.slice(0, MAX_ITEMS);
    const picked = parsed.top
      .filter((n): n is number => typeof n === 'number' && n >= 0 && n < byDate.length)
      .map((n) => byDate[n]!)
      .slice(0, MAX_ITEMS);
    return picked.length > 0 ? picked : byDate.slice(0, MAX_ITEMS);
  } catch {
    return byDate.slice(0, MAX_ITEMS);
  }
}

/**
 * Invalidates the cached news of a client so the next portal open refetches with
 * the updated topics. Called when the agency changes the client's profile
 * (industry/brands/interests) in the backend. Best-effort; ignores errors.
 */
export async function invalidateClientNews(clientCompanyId: string): Promise<void> {
  try {
    await createSupabaseServiceClient()
      .from('client_news')
      .delete()
      .eq('client_company_id', clientCompanyId);
  } catch {
    // ignore – stale cache simply refreshes on the daily schedule instead.
  }
}

/**
 * Current industry news for a client company. Lazily refreshed at most once per
 * day, and only when the client actually opens the portal – so it never runs
 * for clients who are away for days. All I/O uses the service client (the
 * caller has already passed the portal access check).
 */
export async function getClientNews(
  clientCompanyId: string,
  orgId: string,
): Promise<ClientNews> {
  const service = createSupabaseServiceClient();

  const [{ data: cache }, { data: company }] = await Promise.all([
    service.from('client_news').select('items, fetched_at').eq('client_company_id', clientCompanyId).maybeSingle(),
    service.from('client_companies').select('industry, brands, interests, name').eq('id', clientCompanyId).maybeSingle(),
  ]);

  const { queries, label } = buildTopics(
    company ?? { industry: null, brands: null, interests: null, name: null },
  );
  const topic = label;
  const cachedItems = (cache?.items as NewsItem[] | undefined) ?? [];
  // Refresh once per CALENDAR day (Europe/Berlin): a new day → new news, even if
  // less than 24 h have passed since the last fetch. A rolling 24 h window left
  // the news looking stale on a fresh day.
  const fresh =
    cache?.fetched_at &&
    cachedItems.length > 0 &&
    berlinToday(new Date(cache.fetched_at)) === berlinToday();
  if (fresh) return { items: cachedItems, fetchedAt: cache!.fetched_at, topic };

  // Stale or missing → refresh now (this render).
  let items: NewsItem[] = [];
  try {
    if (queries.length > 1) {
      // Several brands → one feed each, interleaved so all brands are covered.
      const perBrand = Math.max(6, Math.ceil((MAX_ITEMS * 2) / queries.length));
      const feeds = await Promise.all(
        queries.map((q) => fetchRssItems(googleNewsUrl(q), perBrand)),
      );
      items = mergeBalanced(feeds, MAX_ITEMS);
    } else {
      const fetched = await fetchRssItems(googleNewsUrl(queries[0] ?? topic), 25);
      items = await curate(fetched, topic);
    }
    // Best-effort: pull a real preview image (og:image) per headline. Google
    // News links are interstitials, so we first resolve the real publisher URL
    // and read og:image from there. Runs only on refresh (≤ once/day), in
    // parallel, and degrades to the colour cover. The outbound link stays the
    // Google URL (which reliably works); only the image uses the resolved URL.
    items = await Promise.all(
      items.map(async (it) => {
        if (it.imageUrl) return it;
        const articleUrl = await resolveArticleUrl(it.url);
        return { ...it, imageUrl: await fetchOgImage(articleUrl) };
      }),
    );
  } catch (e) {
    logger.warn('client_news.refresh_failed', { error: (e as Error).message });
  }

  if (items.length === 0) {
    // Fetch failed – keep showing the last good cache rather than nothing.
    return { items: cachedItems, fetchedAt: cache?.fetched_at ?? null, topic };
  }

  const now = new Date().toISOString();
  await service
    .from('client_news')
    .upsert({ client_company_id: clientCompanyId, organization_id: orgId, items, fetched_at: now });
  return { items, fetchedAt: now, topic };
}
