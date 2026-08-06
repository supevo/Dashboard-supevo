'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startBriefingAction, finishBriefingAction } from '@/features/requests/actions';
import { de } from '@/lib/i18n/de';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

type Step = 'write' | 'clarify' | 'done';

/**
 * Portal: guided briefing. The client writes their briefing; the AI then asks
 * back what is still missing so we can actually start, and turns the completed
 * briefing into a task automatically.
 */
export function SubmitRequestForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [step, setStep] = useState<Step>('write');
  const [body, setBody] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState('');

  function reset() {
    setStep('write');
    setBody('');
    setRequestId(null);
    setQuestions([]);
    setAnswers([]);
    setError(null);
    setDoneMsg('');
  }

  function close() {
    setOpen(false);
    // Reset after the modal close animation.
    setTimeout(reset, 200);
  }

  function finish(qa: { question: string; answer: string }[]) {
    if (!requestId) return;
    setError(null);
    start(async () => {
      const res = await finishBriefingAction({ requestId, answers: qa });
      if (res.status === 'error') {
        setError(res.message);
      } else {
        setDoneMsg(res.status === 'success' ? (res.message ?? 'Danke!') : 'Danke!');
        setStep('done');
        router.refresh();
        setTimeout(close, 2200);
      }
    });
  }

  function submitBriefing() {
    if (body.trim().length < 5) {
      setError('Bitte beschreiben Sie Ihr Anliegen.');
      return;
    }
    setError(null);
    start(async () => {
      const res = await startBriefingAction(projectId, body);
      if (!res.ok || !res.requestId) {
        setError(res.error ?? 'Konnte nicht gesendet werden.');
        return;
      }
      setRequestId(res.requestId);
      const qs = res.questions ?? [];
      if (qs.length === 0) {
        // Nothing missing → create the task right away.
        finish([]);
      } else {
        setQuestions(qs);
        setAnswers(qs.map(() => ''));
        setStep('clarify');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted"
      >
        {de.requests.submit}
      </button>

      <Modal open={open} onClose={close} title={de.requests.submit}>
        {error && <Alert variant="destructive">{error}</Alert>}

        {step === 'write' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{de.requests.hint}</p>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder={de.requests.placeholder}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                {de.common.cancel}
              </button>
              <Button size="sm" disabled={pending} onClick={submitBriefing}>
                {pending ? 'Wird geprüft …' : 'Weiter'}
              </Button>
            </div>
          </div>
        )}

        {step === 'clarify' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Damit wir direkt loslegen können, fehlen uns noch ein paar Angaben. Je mehr Sie
              ergänzen, desto besser können wir die Aufgabe umsetzen.
            </p>
            <ul className="space-y-3">
              {questions.map((q, i) => (
                <li key={i} className="space-y-1">
                  <label className="text-sm font-medium">{q}</label>
                  <Textarea
                    rows={2}
                    value={answers[i] ?? ''}
                    onChange={(e) =>
                      setAnswers((prev) => prev.map((a, idx) => (idx === i ? e.target.value : a)))
                    }
                    placeholder="Ihre Antwort"
                  />
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() => finish(questions.map((q, i) => ({ question: q, answer: answers[i] ?? '' })))}
              >
                {pending ? 'Wird erstellt …' : 'Aufgabe erstellen'}
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="py-4 text-center">
            <div className="mb-2 text-3xl">✅</div>
            <p className="text-sm text-muted-foreground">{doneMsg}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
