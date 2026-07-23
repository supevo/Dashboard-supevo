import * as React from 'react';
import { cn } from '@/lib/utils';

type AlertVariant = 'default' | 'destructive' | 'success';

const variantClasses: Record<AlertVariant, string> = {
  default: 'border-border bg-muted text-foreground',
  destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
  success: 'border-green-500/40 bg-green-500/10 text-green-700',
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

export function Alert({ className, variant = 'default', ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-md border px-4 py-3 text-sm',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
