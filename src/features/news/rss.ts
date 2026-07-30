import 'server-only';

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  /** Vorschaubild, falls der Feed eines liefert (sonst null → Verlauf-Cover). */
  imageUrl: string | null;
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

/** Reads an attribute (e.g. url="…") from the first matching self-closing tag. */
function tagAttr(block: string, name: string, attr: string): string | null {
  const m = block.match(new RegExp(`<${name}\\b[^>]*\\b${attr}=["']([^"']+)["']`, 'i'));
  return m?.[1] ?? null;
}

/** Reads a `<meta property|name="…" content="…">` value from HTML head. */
function metaContent(html: string, prop: string): string | null {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  )?.[0];
  if (!tag) return null;
  return tag.match(/content=["']([^"']+)["']/i)?.[1] ?? null;
}

/**
 * Resolves the REAL publisher article URL from a Google News RSS link.
 *
 * Google News `<link>`s point at `news.google.com/rss/articles/<id>` – a JS
 * interstitial, not the article – so fetching og:image there yields nothing.
 * We ask Google's own resolver endpoint (the same one the interstitial uses) to
 * turn the id into the publisher URL. Fully best-effort: any failure returns the
 * original Google link, so callers never break and behaviour never regresses.
 * Used only for image lookup, never for the outbound link.
 */
export async function resolveArticleUrl(googleUrl: string): Promise<string> {
  try {
    const u = new URL(googleUrl);
    if (u.hostname !== 'news.google.com') return googleUrl;
    const parts = u.pathname.split('/').filter(Boolean);
    const i = parts.findIndex((p) => p === 'articles' || p === 'read');
    const id = i >= 0 ? parts[i + 1] : undefined;
    if (!id) return googleUrl;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      // Step 1: read the signature + timestamp Google embeds in the interstitial.
      const pageRes = await fetch(googleUrl, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; SupevoNews/1.0)' },
        signal: controller.signal,
        cache: 'no-store',
      });
      const html = await pageRes.text();
      const sig = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
      const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
      if (!sig || !ts) return googleUrl;

      // Step 2: ask the resolver endpoint for the real URL.
      const inner = JSON.stringify([
        'garturlreq',
        [
          ['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null,
            null, null, null, 0, 1],
          'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0,
        ],
        id,
        Number(ts),
        sig,
      ]);
      const payload = JSON.stringify([[['Fbv4je', inner, null, 'generic']]]);
      const res = await fetch(
        'https://news.google.com/_/DotsSplashUi/data/batchexecute',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'user-agent': 'Mozilla/5.0 (compatible; SupevoNews/1.0)',
          },
          body: 'f.req=' + encodeURIComponent(payload),
          signal: controller.signal,
          cache: 'no-store',
        },
      );
      const text = await res.text();
      const at = text.indexOf('garturlres');
      if (at === -1) return googleUrl;
      const real = text.slice(at).match(/https?:\/\/[^\\"]+/)?.[0];
      return real ?? googleUrl;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return googleUrl;
  }
}

/**
 * Best-effort preview image for an article: fetches the page and reads its Open
 * Graph / Twitter image. Follows redirects (Google News links point at a
 * redirect that lands on the real article). Returns an https URL or null.
 * Times out fast and swallows all errors so it never breaks a page render.
 */
export async function fetchOgImage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; SupevoNews/1.0)',
        accept: 'text/html',
      },
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    // Only the <head> is needed – cap the read so huge pages stay cheap.
    const html = (await res.text()).slice(0, 250_000);
    const img =
      metaContent(html, 'og:image') ||
      metaContent(html, 'og:image:url') ||
      metaContent(html, 'twitter:image') ||
      metaContent(html, 'twitter:image:src');
    if (!img) return null;
    try {
      const abs = new URL(img, res.url || url).toString();
      return /^https:\/\//i.test(abs) ? abs : null;
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort preview image for a feed item: media:content/thumbnail, an
 * image enclosure, or the first <img> in the description. Google News rarely
 * includes one – the UI falls back to a coloured cover then.
 */
function extractImage(block: string): string | null {
  const candidate =
    tagAttr(block, 'media:content', 'url') ||
    tagAttr(block, 'media:thumbnail', 'url') ||
    tagAttr(block, 'enclosure', 'url');
  if (candidate && /^https?:\/\//i.test(candidate)) return candidate;

  const desc = tag(block, 'description') || tag(block, 'content:encoded');
  const img = desc.match(/<img[^>]*\bsrc=["']([^"']+)["']/i);
  if (img?.[1] && /^https?:\/\//i.test(img[1])) return img[1];
  return null;
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
        imageUrl: extractImage(block),
      });
    }
    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
