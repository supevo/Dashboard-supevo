import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { completeText } from '@/lib/ai/complete';
import { logger } from '@/lib/logger';
import { fetchRssItems, fetchOgImage, googleNewsUrl, type NewsItem } from './rss';

const TTL_MS = 24 * 60 * 60 * 1000; // refresh at most once per day
const MAX_ITEMS = 6;

export interface ClientNews {
  items: NewsItem[];
  fetchedAt: string | null;
  topic: string;
}

/** Builds the news search topic from the client's industry (+ brands). */
function buildTopic(company: {
  industry: string | null;
  brands: string | null;
  name: string | null;
}): string {
  const industry = (company.industry ?? '').trim();
  const brands = (company.brands ?? '').trim();
  if (industry && brands) return `${industry} ${brands.split(/[,;\n]/)[0]?.trim() ?? ''}`.trim();
  return industry || brands || company.name || 'Marketing';
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
    service.from('client_companies').select('industry, brands, name').eq('id', clientCompanyId).maybeSingle(),
  ]);

  const topic = buildTopic(company ?? { industry: null, brands: null, name: null });
  const cachedItems = (cache?.items as NewsItem[] | undefined) ?? [];
  const fresh =
    cache?.fetched_at && Date.now() - new Date(cache.fetched_at).getTime() < TTL_MS;
  if (fresh) return { items: cachedItems, fetchedAt: cache!.fetched_at, topic };

  // Stale or missing → refresh now (this render).
  let items: NewsItem[] = [];
  try {
    const fetched = await fetchRssItems(googleNewsUrl(topic), 25);
    items = await curate(fetched, topic);
    // Best-effort: pull a real preview image (og:image) per headline. Runs only
    // on refresh (≤ once/day), in parallel, and degrades to the colour cover.
    items = await Promise.all(
      items.map(async (it) =>
        it.imageUrl ? it : { ...it, imageUrl: await fetchOgImage(it.url) },
      ),
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
