import Link from 'next/link';

/**
 * Friendly empty state for lists: an icon, a short headline, an optional
 * explanation and an optional call-to-action. Replaces bland "keine Einträge"
 * lines so empty screens guide the user instead of feeling broken.
 */
export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
  className,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center ${className ?? ''}`}
    >
      <div className="mb-3 text-4xl" aria-hidden>
        {icon}
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && (
        <Link
          href={action.href}
          className="mt-4 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
