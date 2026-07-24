'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Project cover thumbnail with a graceful fallback. If the project has no cover
 * image (the endpoint 404s), a coloured placeholder with the initial is shown.
 */
export function ProjectCover({
  projectId,
  name,
  className,
}: {
  projectId: string;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const box = cn(
    'flex items-center justify-center overflow-hidden rounded-md bg-muted',
    className,
  );

  if (failed) {
    return (
      <div className={cn(box, 'bg-primary/15 text-primary')}>
        <span className="text-lg font-semibold">
          {name.trim().charAt(0).toUpperCase() || '#'}
        </span>
      </div>
    );
  }

  return (
    <div className={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/projects/${projectId}/cover`}
        alt={name}
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
