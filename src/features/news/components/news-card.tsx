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

/** Stable 32-bit hash of a string (for a deterministic image seed). */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * A themed stock photo when the article delivers no image: a keyword-matched
 * Flickr photo (loremflickr), themed to the client's topic and made stable per
 * article via a lock derived from the title. Not the exact article photo, but a
 * fitting cover instead of a flat colour block.
 */
function themedPhotoUrl(topic: string, seed: string): string {
  const tag =
    topic
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)[0] || 'business';
  return `https://loremflickr.com/640/360/${encodeURIComponent(tag)}?lock=${hash(seed) % 100000}`;
}

/**
 * A single industry-news article rendered as a blog-style preview card:
 * cover image with the title below. Links out to the original article. Client
 * component: if the article has no image (or it fails to load), a themed stock
 * photo is shown; only if that also fails do we fall back to a coloured cover.
 */
export function NewsCard({ item, topic = '' }: { item: NewsItem; topic?: string }) {
  const themed = themedPhotoUrl(topic, item.url || item.title);
  // First try the real article image, then the themed photo, then the gradient.
  const [src, setSrc] = useState<string | null>(item.imageUrl || themed);
  const hue = hueFrom(item.source || item.title);
  const gradient = `linear-gradient(135deg, hsl(${hue} 68% 46%), hsl(${(hue + 40) % 360} 70% 32%))`;

  const onImgError = () => {
    // Article image failed → try the themed photo; if that's what failed → cover.
    setSrc((cur) => (cur && cur !== themed ? themed : null));
  };

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="group flex flex-col overflow-hidden rounded-xl border bg-card transition hover:shadow-md"
    >
      <div className="relative h-32 w-full overflow-hidden">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="h-32 w-full object-cover transition group-hover:scale-[1.03]"
            onError={onImgError}
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
