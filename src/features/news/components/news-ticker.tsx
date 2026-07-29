import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { de } from '@/lib/i18n/de';
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

/**
 * Industry news ticker for the client portal: current, curated headlines that
 * link out to the original (free) articles. Read-only server component.
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
        <ul className="divide-y">
          {items.map((it, i) => (
            <li key={`${it.url}-${i}`} className="py-2">
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="group flex flex-col gap-0.5"
              >
                <span className="text-sm font-medium text-foreground group-hover:text-primary group-hover:underline">
                  {it.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {it.source}
                  {it.publishedAt ? ` · ${timeAgo(it.publishedAt)}` : ''}
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted-foreground">{de.news.footer}</p>
      </CardContent>
    </Card>
  );
}
