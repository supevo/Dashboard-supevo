'use client';

import { useState } from 'react';
import type { NewsItem } from '@/features/news/rss';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'gerade eben';
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}`;
}

/** Deterministic hue from a string so each source gets a stable cover colour. */
function hueFrom(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/**
 * A single industry-news article rendered as a blog-style preview card:
 * cover image (or a coloured gradient fallback) with the title below. Links out
 * to the original article. Client component so a broken image falls back
 * gracefully to the gradient cover.
 */
export function NewsCard({ item }: { item: NewsItem }) {
  const [imgOk, setImgOk] = useState(Boolean(item.imageUrl));
  const hue = hueFrom(item.source || item.title);
  const gradient = `linear-gradient(135deg, hsl(${hue} 68% 46%), hsl(${(hue + 40) % 360} 70% 32%))`;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="group flex flex-col overflow-hidden rounded-xl border bg-card transition hover:shadow-md"
    >
      <div className="relative h-32 w-full overflow-hidden">
        {imgOk && item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            className="h-32 w-full object-cover transition group-hover:scale-[1.03]"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div
            className="flex h-32 w-full items-end p-2"
            style={{ background: gradient }}
            aria-hidden
          >
            <span className="rounded bg-black/35 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {item.source}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 text-sm font-semibold text-foreground group-hover:text-primary">
          {item.title}
        </span>
        <span className="mt-auto text-xs text-muted-foreground">
          {item.source}
          {item.publishedAt ? ` · ${timeAgo(item.publishedAt)}` : ''}
        </span>
      </div>
    </a>
  );
}
