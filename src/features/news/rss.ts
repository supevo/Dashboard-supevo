import 'server-only';

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
}

/** Google News RSS search for a topic – free, no key, real article links. */
export function googleNewsUrl(query: string): string {
  const q = encodeURIComponent(query.trim() || 'Marketing');
  return `https://news.google.com/rss/search?q=${q}&hl=de&gl=DE&ceid=DE:de`;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(
    new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'),
  );
  if (!m) return '';
  const raw = m[1] ?? '';
  const cdata = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return decodeEntities((cdata ? cdata[1] : raw) ?? '');
}

/**
 * Fetches and parses an RSS feed into news items. Times out fast so it can
 * never hang a page render; returns [] on any failure.
 */
export async function fetchRssItems(
  url: string,
  limit = 20,
): Promise<NewsItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SupevoNews/1.0)' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const items: NewsItem[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) && items.length < limit) {
      const block = m[1] ?? '';
      const title = tag(block, 'title');
      const link = tag(block, 'link');
      if (!title || !link) continue;
      const pub = tag(block, 'pubDate');
      const parsed = pub ? new Date(pub) : null;
      items.push({
        title,
        url: link,
        source: tag(block, 'source') || 'News',
        publishedAt: parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      });
    }
    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
