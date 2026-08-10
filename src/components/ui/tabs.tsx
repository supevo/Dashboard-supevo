'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface TabDef {
  key: string;
  label: string;
  content: React.ReactNode;
}

/**
 * Lightweight tabbed container. All panels stay mounted (hidden via CSS) so
 * in-progress form input survives switching tabs. Server-rendered content can be
 * passed as each tab's `content`.
 */
export function Tabs({ tabs, initialKey }: { tabs: TabDef[]; initialKey?: string }) {
  const [active, setActive] = useState(initialKey ?? tabs[0]?.key ?? '');

  // When the server passes a new initialKey (URL ?tab= changed via a link or a
  // switcher), follow it. Plain tab-button clicks don't change the URL, so this
  // never fights user interaction.
  useEffect(() => {
    if (initialKey) setActive(initialKey);
  }, [initialKey]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition',
              active === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabs.map((t) => (
        <div
          key={t.key}
          className={cn('space-y-6', active === t.key ? '' : 'hidden')}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
