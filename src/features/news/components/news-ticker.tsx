'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { de } from '@/lib/i18n/de';
import type { NewsItem } from '@/features/news/rss';
import { NewsCard } from '@/features/news/components/news-card';

const INITIAL = 3;

/**
 * Industry news for the client portal, shown as a blog-style post gallery.
 * Only the first few headlines are shown; "Mehr anzeigen" reveals the rest so
 * the section stays compact by default. Links open the original (free) article.
 */
export function NewsTicker({
  items,
  topic,
}: {
  items: NewsItem[];
  topic: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const shown = expanded ? items : items.slice(0, INITIAL);
  const hasMore = items.length > INITIAL;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>📰 {de.news.title}</CardTitle>
          <span className="truncate text-xs text-muted-foreground">
            {de.news.topic}: {topic}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((it, i) => (
            <NewsCard key={`${it.url}-${i}`} item={it} topic={topic} />
          ))}
        </div>

        {hasMore && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-md border px-4 py-2 text-sm font-medium transition hover:bg-muted"
            >
              {expanded
                ? de.news.showLess
                : `${de.news.showMore} (${items.length - INITIAL})`}
            </button>
          </div>
        )}

        <p className="mt-4 text-[11px] text-muted-foreground">{de.news.footer}</p>
      </CardContent>
    </Card>
  );
}
