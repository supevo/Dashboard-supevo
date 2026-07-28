'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getClarifyingQuestionsForRequest,
  createTaskFromBriefingAction,
} from '@/features/requests/actions';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { de } from '@/lib/i18n/de';

/**
 * "Aufgabe mit KI erstellen" – opens a dialog where the AI asks the few most
 * important clarifying questions a briefing is still missing. The agency fills
 * in what it can, then one well-specified task is created automatically.
 */
export function AiTaskDialog({
  clientCompanyId,
  requestId,
}: {
  clientCompanyId: string;
  requestId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, startLoading] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isInternal, setIsInternal] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function start() {
    setError(null);
    setQuestions(null);
    setAnswers({});
    setIsInternal(true);
    setOpen(true);
    startLoading(async () => {
      const res = await getClarifyingQuestionsForRequest(requestId);
      if (!res.ok) {
        setError(res.error ?? de.errors.INTERNAL);
        setQuestions([]);
        return;
      }
      setQuestions(res.questions);
    });
  }

  function submit() {
    setError(null);
    startSubmit(async () => {
      const qa = (questions ?? []).map((q, i) => ({
        question: q,
        answer: answers[i] ?? '',
      }));
      const res = await createTaskFromBriefingAction({
        requestId,
        clientCompanyId,
        isInternal,
        answers: qa,
      });
      if (res.status === 'error') {
        setError(res.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={start}>
        🪄 {de.requests.aiCreate}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={de.requests.aiCreate}>
        {loading && (
          <p className="text-sm text-muted-foreground">{de.requests.aiThinking}</p>
        )}

        {!loading && questions !== null && (
          <div className="space-y-4">
            {questions.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {de.requests.aiIntro}
                </p>
                <div className="space-y-3">
                  {questions.map((q, i) => (
                    <div key={i} className="space-y-1">
                      <label className="text-sm font-medium">{q}</label>
                      <Textarea
                        rows={2}
                        value={answers[i] ?? ''}
                        onChange={(e) =>
                          setAnswers((a) => ({ ...a, [i]: e.target.value }))
                        }
                        placeholder={de.requests.aiAnswerPlaceholder}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{de.requests.aiNoQuestions}</p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {de.task.visibility}
                <Select
                  value={isInternal ? 'true' : 'false'}
                  onChange={(e) => setIsInternal(e.target.value === 'true')}
                  className="h-8 w-auto text-xs"
                >
                  <option value="true">{de.task.internal}</option>
                  <option value="false">{de.task.clientVisible}</option>
                </Select>
              </label>
              <Button size="sm" onClick={submit} disabled={submitting}>
                {submitting ? de.requests.aiCreating : de.requests.aiCreateTask}
              </Button>
            </div>

            {error && <Alert variant="destructive">{error}</Alert>}
          </div>
        )}
      </Modal>
    </>
  );
}
