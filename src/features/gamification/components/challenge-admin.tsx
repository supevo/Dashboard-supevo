'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createChallengeAction,
  setChallengeActiveAction,
  deleteChallengeAction,
  reactivateChallengeAction,
} from '@/features/gamification/custom-challenge-actions';
import type { AdminChallenge } from '@/features/gamification/custom-challenges';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface MetricOption {
  key: string;
  label: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ChallengeAdmin({
  challenges,
  metricOptions,
}: {
  challenges: AdminChallenge[];
  metricOptions: MetricOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('🏆');
  const [metric, setMetric] = useState(metricOptions[0]?.key ?? 'missions');
  const [target, setTarget] = useState(10);
  const [xp, setXp] = useState(50);
  const [kind, setKind] = useState<'weekly' | 'team'>('weekly');
  const [badgeName, setBadgeName] = useState('');
  const [badgeEmoji, setBadgeEmoji] = useState('🏅');
  const [weekDate, setWeekDate] = useState(todayIso());

  function create() {
    setError(null);
    start(async () => {
      const res = await createChallengeAction({
        title,
        description,
        emoji,
        metric,
        target,
        xp,
        kind,
        badgeName,
        badgeEmoji,
        weekDate,
      });
      if (res.status === 'error') {
        setError(res.message);
        return;
      }
      setTitle('');
      setDescription('');
      setBadgeName('');
      router.refresh();
    });
  }

  function run(action: () => Promise<{ status: string; message?: string }>) {
    setError(null);
    start(async () => {
      const res = await action();
      if (res.status === 'error') setError(res.message ?? 'Fehler');
      router.refresh();
    });
  }

  const metricLabel = (key: string) =>
    metricOptions.find((m) => m.key === key)?.label ?? key;

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="text-sm font-semibold">Neue Challenge</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Titel</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="z. B. Wochensprint" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Emoji (Challenge)</label>
            <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} className="w-24" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Beschreibung (optional)</label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Art</label>
            <Select value={kind} onChange={(e) => setKind(e.target.value as 'weekly' | 'team')}>
              <option value="weekly">Einzel (pro Person)</option>
              <option value="team">Team (gemeinsam)</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Auslöser</label>
            <Select value={metric} onChange={(e) => setMetric(e.target.value)}>
              {metricOptions.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Ziel (Anzahl)</label>
            <Input type="number" min={1} value={target} onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">XP-Belohnung</label>
            <Input type="number" min={0} value={xp} onChange={(e) => setXp(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Badge-Name (optional)</label>
            <Input value={badgeName} onChange={(e) => setBadgeName(e.target.value)} maxLength={60} placeholder="z. B. Sprinter" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Badge-Emoji</label>
            <Input value={badgeEmoji} onChange={(e) => setBadgeEmoji(e.target.value)} maxLength={8} className="w-24" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Woche (Datum)</label>
            <Input type="date" value={weekDate} onChange={(e) => setWeekDate(e.target.value)} />
          </div>
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button size="sm" onClick={create} disabled={pending || title.trim().length < 2}>
          Challenge anlegen
        </Button>
        <p className="text-xs text-muted-foreground">
          Team-Challenges zählen die Summe des ganzen Teams. Das Badge landet bei Zielerreichung automatisch in der Badge-Sammlung. Die Woche richtet sich nach dem gewählten Datum (Montag der Woche).
        </p>
      </div>

      {/* List */}
      {challenges.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Challenges angelegt.</p>
      ) : (
        <ul className="space-y-2">
          {challenges.map((c) => (
            <li
              key={c.id}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-lg border p-3',
                c.isCurrent && c.active && 'border-primary/40 bg-primary/5',
              )}
            >
              <span className="text-xl" aria-hidden>{c.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{c.title}</span>
                  {c.kind === 'team' && (
                    <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">👥 Team</span>
                  )}
                  {c.isCurrent && (
                    <span className="rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                      diese Woche
                    </span>
                  )}
                  {!c.active && (
                    <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">pausiert</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {metricLabel(c.metric)} ≥ {c.target} · +{c.xp} XP
                  {c.badgeName ? ` · Badge ${c.badgeEmoji ?? '🏅'} ${c.badgeName}` : ''} · Woche ab {c.weekStart}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => setChallengeActiveAction(c.id, !c.active))}
                >
                  {c.active ? 'Pausieren' : 'Aktivieren'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  title="Mit gleichem Badge in die aktuelle Woche kopieren"
                  onClick={() => run(() => reactivateChallengeAction({ id: c.id, weekDate: todayIso() }))}
                >
                  Reaktivieren
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  aria-label="Löschen"
                  onClick={() => run(() => deleteChallengeAction(c.id))}
                >
                  ✕
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
