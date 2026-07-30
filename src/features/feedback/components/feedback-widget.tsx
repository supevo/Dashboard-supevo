'use client';

import { useActionState, useEffect, useState } from 'react';
import { submitFeedbackAction } from '@/features/feedback/actions';
import { idleResult } from '@/lib/action-result';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';

const BETA_KEY = 'supevo:beta-notice-v1';

type Kind = 'bug' | 'idea' | 'wish';

const KINDS: { key: Kind; emoji: string; label: string }[] = [
  { key: 'bug', emoji: '🐞', label: 'Fehler' },
  { key: 'idea', emoji: '💡', label: 'Idee' },
  { key: 'wish', emoji: '⭐', label: 'Wunsch' },
];

/**
 * Beta-Hinweis (einmalig beim ersten Öffnen) + Feedback-Button unten links.
 * Über den Button melden Mitarbeiter und Kunden Fehler, Ideen und Wünsche direkt
 * ans Team. Wird in beiden Bereichen (Agentur & Portal) eingebunden.
 */
export function FeedbackWidget() {
  const [showBeta, setShowBeta] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('idea');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [state, action] = useActionState(submitFeedbackAction, idleResult);

  useEffect(() => {
    try {
      if (!localStorage.getItem(BETA_KEY)) setShowBeta(true);
    } catch {
      /* localStorage unavailable → skip */
    }
  }, []);

  const dismissBeta = () => {
    try {
      localStorage.setItem(BETA_KEY, '1');
    } catch {
      /* ignore */
    }
    setShowBeta(false);
  };

  useEffect(() => {
    if (state.status === 'success') {
      setTitle('');
      setMessage('');
    }
  }, [state.status]);

  return (
    <>
      {/* Floating-Button unten links */}
      <button
        type="button"
        onClick={() => setReportOpen(true)}
        aria-label="Feedback geben – Fehler, Idee oder Wunsch"
        title="Feedback: Fehler, Idee oder Wunsch melden"
        className="fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border bg-card text-xl shadow-lg transition hover:scale-105 hover:bg-muted"
      >
        💬
      </button>

      {/* Beta-Hinweis (einmalig) */}
      <Modal open={showBeta} onClose={dismissBeta} title="👋 Willkommen in der Beta">
        <div className="space-y-3 text-sm">
          <p>
            Dieses Board befindet sich in der <strong>Beta-Phase</strong>. Es kann
            noch zu Fehlern kommen – danke für dein Verständnis!
          </p>
          <p>
            <strong>Deine Wünsche, Ideen und Fehler</strong> kannst du jederzeit
            über den <span className="font-medium">💬-Button unten links</span>{' '}
            melden. Dort beschreibst du es kurz und schickst es direkt an unser
            Team.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={dismissBeta}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Verstanden
            </button>
          </div>
        </div>
      </Modal>

      {/* Feedback melden */}
      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Feedback ans Team"
      >
        <form action={action} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Fehler gefunden, eine Idee oder ein Wunsch? Beschreibe es kurz – wir
            kümmern uns darum.
          </p>

          <input type="hidden" name="kind" value={kind} />
          <div className="flex gap-2">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-sm transition',
                  kind === k.key
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'hover:bg-muted',
                )}
              >
                <span aria-hidden>{k.emoji}</span>
                {k.label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <label htmlFor="fb-title" className="text-xs text-muted-foreground">
              Titel
            </label>
            <Input
              id="fb-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Kurz & knackig"
              maxLength={140}
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="fb-msg" className="text-xs text-muted-foreground">
              Beschreibung (optional)
            </label>
            <Textarea
              id="fb-msg"
              name="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Was ist passiert / was wünschst du dir? Je konkreter, desto besser."
              maxLength={4000}
            />
          </div>

          {state.status === 'error' && (
            <Alert variant="destructive">{state.message}</Alert>
          )}
          {state.status === 'success' && (
            <Alert variant="success">{state.message}</Alert>
          )}

          <div className="flex justify-end">
            <SubmitButton size="sm">Ans Team senden</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
