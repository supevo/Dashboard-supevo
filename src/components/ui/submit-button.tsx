'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from './button';
import { de } from '@/lib/i18n/de';

/** Submit button that disables itself and shows a pending label while the
 *  enclosing form action is running. */
export function SubmitButton({ children, disabled, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending ? de.common.loading : children}
    </Button>
  );
}
