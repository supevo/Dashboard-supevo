'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestAbsenceAction } from '@/features/absences/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

interface Suggestion {
  start: string;
  end: string;
  reason: string;
}

function fmt(d: string): string {
  return d.split('-').reverse().join('.');
}

/** AI/heuristic vacation-window helper, shown only for "Urlaub". */
function VacationHint({ onApply }: { onApply: (s: Suggestion) => void }) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState(false);

  const fetchSuggestion = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/absences/suggest', { cache: 'no-store' });
      const data = (await res.json()) as { suggestion: Suggestion | null };
      if (data.suggestion) setSuggestion(data.suggestion);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">✨ {de.absence.suggestTitle}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={fetchSuggestion}
          disabled={loading}
        >
          {loading ? de.common.loading : de.absence.suggestButton}
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-muted-foreground">{de.absence.suggestError}</p>
      )}
      {suggestion && (
        <div className="mt-2 space-y-1">
          <div className="text-sm font-medium">
            {fmt(suggestion.start)} – {fmt(suggestion.end)}
          </div>
          <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
          <Button type="button" size="sm" onClick={() => onApply(suggestion)}>
            {de.absence.suggestApply}
          </Button>
        </div>
      )}
    </div>
  );
}

export function RequestAbsenceForm() {
  const [state, action] = useActionState(requestAbsenceAction, idleResult);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [type, setType] = useState('urlaub');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      setStartDate('');
      setEndDate('');
      setType('urlaub');
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && (
        <Alert variant="success">{state.message}</Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="type">{de.absence.type}</Label>
          <Select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9"
          >
            <option value="urlaub">{de.absence.types.urlaub}</option>
            <option value="krank">{de.absence.types.krank}</option>
            <option value="sonstiges">{de.absence.types.sonstiges}</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="startDate">{de.absence.from}</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="endDate">{de.absence.to}</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      {type === 'urlaub' && (
        <VacationHint
          onApply={(s) => {
            setStartDate(s.start);
            setEndDate(s.end);
          }}
        />
      )}

      <div className="space-y-1">
        <Label htmlFor="note">{de.absence.note}</Label>
        <Textarea id="note" name="note" rows={2} />
      </div>
      <SubmitButton size="sm">{de.absence.submit}</SubmitButton>
    </form>
  );
}
