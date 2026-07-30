import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { de } from '@/lib/i18n/de';
import type { NewsItem } from '@/features/news/rss';
import { NewsCard } from '@/features/news/components/news-card';

/**
 * Industry news for the client portal, shown as a blog-style post gallery:
 * each headline is a card with a cover image (or coloured fallback) and title,
 * linking out to the original (free) article. Read-only server component.
 */
export function NewsTicker({
  items,
  topic,
}: {
  items: NewsItem[];
  topic: string;
}) {
  if (items.length === 0) return null;

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
          {items.map((it, i) => (
            <NewsCard key={`${it.url}-${i}`} item={it} topic={topic} />
          ))}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">{de.news.footer}</p>
      </CardContent>
    </Card>
  );
}
