'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { giveKudosAction } from '@/features/kudos/actions';
import { idleResult } from '@/lib/action-result';
import { BADGES } from '@/features/kudos/badges';
import { de } from '@/lib/i18n/de';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export function GiveKudos({
  colleagues,
}: {
  colleagues: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(giveKudosAction, idleResult);
  const [badge, setBadge] = useState(BADGES[0]?.key ?? '');
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      setBadge(BADGES[0]?.key ?? '');
      router.refresh();
    }
  }, [state, router]);

  if (colleagues.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{de.kudos.noColleagues}</p>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {state.status === 'success' && (
        <Alert variant="success">{state.message}</Alert>
      )}
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}

      <div className="space-y-1">
        <Label htmlFor="k-to">{de.kudos.to}</Label>
        <Select id="k-to" name="toUserId" required>
          {colleagues.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <input type="hidden" name="badge" value={badge} />
      <div className="space-y-1">
        <Label>{de.kudos.badge}</Label>
        <div className="flex flex-wrap gap-2">
          {BADGES.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBadge(b.key)}
              className={cn(
                'flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors',
                badge === b.key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'hover:bg-muted',
              )}
            >
              <span>{b.emoji}</span>
              {b.label}
              <span className="text-xs text-muted-foreground">+{b.points}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="k-msg">{de.kudos.message}</Label>
        <Textarea
          id="k-msg"
          name="message"
          rows={2}
          placeholder={de.kudos.messagePlaceholder}
        />
      </div>

      <SubmitButton size="sm">{de.kudos.give}</SubmitButton>
    </form>
  );
}
