import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCounters } from '@/features/gamification/counters';
import { getXpPoints } from '@/features/gamification/xp';

/** Hour (0–23) and weekday (0=Sun..6=Sat) of a timestamp in German local time,
 *  so the time-of-day badges match Europe/Berlin, not the UTC server clock. */
function berlinParts(iso: string): { hour: number; day: number } {
  const d = new Date(iso);
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(d),
  );
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
  }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour, day: map[wd] ?? 0 };
}

/**
 * Collectible badges. Each badge is unlocked when a single metric reaches its
 * threshold. Adding a badge = one line here (plus the metric in buildStats if
 * it needs a new data source). Names are intentionally playful; the unlock
 * criterion is NEVER shown in the UI – only the name appears on hover.
 */
export type BadgeMetric =
  | 'missions'
  | 'takenOver'
  | 'tasksCreated'
  | 'taskMoves'
  | 'ratingsGiven'
  | 'clientsCreated'
  | 'projectsCreated'
  | 'chatMessages'
  | 'timerStamps'
  | 'vacations'
  | 'profileComplete'
  | 'themeToggles'
  | 'dnd'
  | 'points'
  | 'ontime'
  | 'earlyBird'
  | 'nightOwl'
  | 'weekendWarrior'
  | 'blitz'
  | 'qualityKudos'
  | 'retterKudos'
  | 'badgesEarned';

export interface BadgeDef {
  key: string;
  name: string;
  emoji: string;
  metric: BadgeMetric;
  threshold: number;
  /** Shown ONLY in the unlock animation – never on hover in the wall. */
  reason: string;
}

export const BADGE_CATALOG: BadgeDef[] = [
  // Missionen (erledigte Aufgaben)
  { key: 'first_mission', name: 'Erste Mission', emoji: '🎯', metric: 'missions', threshold: 1, reason: 'Erste Aufgabe erledigt' },
  { key: 'missions_10', name: 'Aufgabenjäger', emoji: '🔟', metric: 'missions', threshold: 10, reason: '10 Aufgaben erledigt' },
  { key: 'missions_50', name: 'Vielschaffer', emoji: '🏅', metric: 'missions', threshold: 50, reason: '50 Aufgaben erledigt' },
  { key: 'missions_100', name: 'Durchstarter', emoji: '💯', metric: 'missions', threshold: 100, reason: '100 Aufgaben erledigt' },
  // Aufgaben von Kollegen übernommen
  { key: 'entlaster', name: 'Entlaster', emoji: '🤝', metric: 'takenOver', threshold: 3, reason: '3 Aufgaben von Kollegen übernommen' },
  { key: 'buddy', name: 'Buddy', emoji: '🫂', metric: 'takenOver', threshold: 10, reason: '10 Aufgaben von Kollegen übernommen' },
  // Aufgaben erstellt
  { key: 'regler', name: 'Regler', emoji: '🎚️', metric: 'tasksCreated', threshold: 5, reason: '5 Aufgaben erstellt' },
  { key: 'fliessband', name: 'Fließband', emoji: '🏭', metric: 'tasksCreated', threshold: 15, reason: '15 Aufgaben erstellt' },
  // Aufgaben verschoben / bewertet
  { key: 'ordnungsfimmel', name: 'Ordnungsfimmel', emoji: '🧹', metric: 'taskMoves', threshold: 50, reason: '50 Aufgaben verschoben' },
  { key: 'gedrueckt', name: 'Einfach was gedrückt', emoji: '🔘', metric: 'ratingsGiven', threshold: 50, reason: '50 Aufgaben bewertet' },
  // Kunden & Projekte
  { key: 'kundenmagnet', name: 'Kundenmagnet', emoji: '🧲', metric: 'clientsCreated', threshold: 1, reason: 'Einen Kunden angelegt' },
  { key: 'projektpionier', name: 'Projekt-Pionier', emoji: '🚩', metric: 'projectsCreated', threshold: 1, reason: 'Ein Projekt angelegt' },
  // Chat
  { key: 'plaudertasche', name: 'Plaudertasche', emoji: '💬', metric: 'chatMessages', threshold: 25, reason: '25 Chat-Nachrichten gesendet' },
  { key: 'schreibmaschine', name: 'Schreibmaschine', emoji: '⌨️', metric: 'chatMessages', threshold: 100, reason: '100 Chat-Nachrichten gesendet' },
  // Zeit
  { key: 'erster_stempel', name: 'Erster Stempel', emoji: '🕐', metric: 'timerStamps', threshold: 1, reason: 'Zum ersten Mal Zeit erfasst' },
  { key: 'stempelkoenig', name: 'Stempelkönig', emoji: '⏱️', metric: 'timerStamps', threshold: 200, reason: '200 Mal Zeit erfasst' },
  { key: 'urlaubsreif', name: 'Urlaubsreif', emoji: '🏖️', metric: 'vacations', threshold: 5, reason: '5 Mal Urlaub beantragt' },
  // Profil & Style
  { key: 'profil', name: 'Profi(l)', emoji: '🧑‍💼', metric: 'profileComplete', threshold: 1, reason: 'Profil komplett ausgefüllt' },
  { key: 'michael_jackson', name: 'Michael Jackson', emoji: '🕺', metric: 'themeToggles', threshold: 20, reason: '20 Mal das Design gewechselt' },
  { key: 'lass_mich_allein', name: 'Lass mich allein', emoji: '🚷', metric: 'dnd', threshold: 20, reason: '20 Mal auf „Nicht stören" gestellt' },
  // Rhythmus (Uhrzeit/Tag des Abschlusses)
  { key: 'fruehaufsteher', name: 'Frühaufsteher', emoji: '🌅', metric: 'earlyBird', threshold: 1, reason: 'Aufgabe vor 7 Uhr erledigt' },
  { key: 'nachteule', name: 'Nachteule', emoji: '🦉', metric: 'nightOwl', threshold: 1, reason: 'Aufgabe nach 22 Uhr erledigt' },
  { key: 'wochenendkrieger', name: 'Wochenendkrieger', emoji: '⚔️', metric: 'weekendWarrior', threshold: 1, reason: 'Am Wochenende gearbeitet' },
  { key: 'blitzableiter', name: 'Blitzableiter', emoji: '⚡', metric: 'blitz', threshold: 1, reason: 'Aufgabe in unter 10 Minuten erledigt' },
  // Anerkennung & Level
  { key: 'publikumsliebling', name: 'Publikumsliebling', emoji: '🌟', metric: 'qualityKudos', threshold: 10, reason: '10 Mal für Qualität gelobt' },
  { key: 'retter', name: 'Retter in der Not', emoji: '🦸', metric: 'retterKudos', threshold: 1, reason: 'Als Retter in der Not ausgezeichnet' },
  { key: 'grande', name: 'Grande', emoji: '🎖️', metric: 'points', threshold: 900, reason: 'Level 10 erreicht' },
  { key: 'punktesammler', name: 'Punktesammler', emoji: '💰', metric: 'points', threshold: 1000, reason: '1.000 XP gesammelt' },
  { key: 'lobhudler', name: 'Lobhudler', emoji: '👏', metric: 'ratingsGiven', threshold: 25, reason: '25 Mal Kollegen gelobt' },
  { key: 'deadline_held', name: 'Deadline-Held', emoji: '⏰', metric: 'ontime', threshold: 20, reason: '20 Mal pünktlich geliefert' },
  // Meta (Anzahl freigespielter Badges) – werden zuletzt ausgewertet
  { key: 'sammler', name: 'Sammler', emoji: '🧺', metric: 'badgesEarned', threshold: 10, reason: '10 Badges freigespielt' },
  { key: 'vollstaendig', name: 'Vollständig', emoji: '🏆', metric: 'badgesEarned', threshold: 999, reason: 'Alle Badges freigespielt' },
];

/** Map from badge key to its unlock reason (for the unlock animation). */
export const BADGE_REASON = new Map(BADGE_CATALOG.map((b) => [b.key, b.reason] as const));

/** Badges whose criterion depends on how many *other* badges are earned. */
const META_KEYS = new Set(['sammler', 'vollstaendig']);

export interface WallBadge {
  key: string;
  name: string;
  emoji: string;
  earned: boolean;
}

/** Gathers every metric a badge might need, then evaluates the catalog. */
export async function getBadgeWall(
  userId: string,
  orgId: string,
): Promise<WallBadge[]> {
  const supabase = await createSupabaseServerClient();
  const head = { count: 'exact' as const, head: true };

  const [
    missionsRes,
    completedRows,
    tasksCreatedRes,
    taskMovesRes,
    ratingsGivenRes,
    clientsCreatedRes,
    projectsCreatedRes,
    chatMessagesRes,
    timerStampsRes,
    vacationsRes,
    profileRes,
    skillsRes,
    kudosReceivedRes,
    ontimeRes,
    xpPoints,
    counters,
  ] = await Promise.all([
    supabase.from('tasks').select('id', head).eq('completed_by', userId),
    supabase.from('tasks').select('created_by, created_at, completed_at').eq('completed_by', userId),
    supabase.from('tasks').select('id', head).eq('created_by', userId),
    supabase.from('activity_log').select('id', head).eq('actor_id', userId).eq('action', 'status_change'),
    supabase.from('kudos').select('id', head).eq('from_user_id', userId),
    supabase.from('client_companies').select('id', head).eq('created_by', userId),
    supabase.from('projects').select('id', head).eq('created_by', userId),
    supabase.from('client_chat_messages').select('id', head).eq('author_id', userId),
    supabase.from('time_entries').select('id', head).eq('user_id', userId),
    supabase.from('absences').select('id', head).eq('user_id', userId).eq('type', 'urlaub'),
    supabase.from('profiles').select('full_name, avatar_url').eq('id', userId).maybeSingle(),
    supabase.from('employee_skills').select('id', head).eq('user_id', userId),
    supabase.from('kudos').select('points, badge').eq('to_user_id', userId),
    supabase.from('xp_events').select('id', head).eq('user_id', userId).eq('kind', 'ontime'),
    getXpPoints(userId),
    getCounters(userId),
  ]);

  const missions = missionsRes.count ?? 0;
  const tasksCreated = tasksCreatedRes.count ?? 0;
  const taskMoves = taskMovesRes.count ?? 0;
  const ratingsGiven = ratingsGivenRes.count ?? 0;
  const clientsCreated = clientsCreatedRes.count ?? 0;
  const projectsCreated = projectsCreatedRes.count ?? 0;
  const chatMessages = chatMessagesRes.count ?? 0;
  const timerStamps = timerStampsRes.count ?? 0;
  const vacations = vacationsRes.count ?? 0;

  // Time-of-day / weekday metrics from the user's completed tasks.
  let takenOver = 0;
  let earlyBird = 0;
  let nightOwl = 0;
  let weekendWarrior = 0;
  let blitz = 0;
  for (const t of completedRows.data ?? []) {
    if (t.created_by && t.created_by !== userId) takenOver += 1;
    if (!t.completed_at) continue;
    const done = new Date(t.completed_at);
    const { hour, day } = berlinParts(t.completed_at); // German local time
    if (hour < 7) earlyBird += 1;
    if (hour >= 22) nightOwl += 1;
    if (day === 0 || day === 6) weekendWarrior += 1;
    if (t.created_at && done.getTime() - new Date(t.created_at).getTime() < 10 * 60_000) {
      blitz += 1;
    }
  }

  const received = kudosReceivedRes.data ?? [];
  const points = received.reduce((n, k) => n + (k.points ?? 0), 0) + xpPoints;
  const qualityKudos = received.filter((k) => k.badge === 'qualitaet').length;
  const retterKudos = received.filter((k) => k.badge === 'retter').length;

  const profile = profileRes.data;
  const profileComplete =
    profile?.full_name && profile.avatar_url && (skillsRes.count ?? 0) > 0 ? 1 : 0;

  const stats: Record<BadgeMetric, number> = {
    missions,
    takenOver,
    tasksCreated,
    taskMoves,
    ratingsGiven,
    clientsCreated,
    projectsCreated,
    chatMessages,
    timerStamps,
    vacations,
    profileComplete,
    themeToggles: counters.get('theme_toggle') ?? 0,
    dnd: counters.get('dnd') ?? 0,
    points,
    ontime: ontimeRes.count ?? 0,
    earlyBird,
    nightOwl,
    weekendWarrior,
    blitz,
    qualityKudos,
    retterKudos,
    badgesEarned: 0, // filled after the non-meta pass
  };
  void orgId;

  // First pass: everything except the meta badges.
  const nonMeta = BADGE_CATALOG.filter((b) => !META_KEYS.has(b.key));
  const evaluated: WallBadge[] = nonMeta.map((b) => ({
    key: b.key,
    name: b.name,
    emoji: b.emoji,
    earned: (stats[b.metric] ?? 0) >= b.threshold,
  }));
  const earnedCount = evaluated.filter((e) => e.earned).length;

  // Second pass: meta badges depend on how many others are earned.
  const metaBadges: WallBadge[] = BADGE_CATALOG.filter((b) => META_KEYS.has(b.key)).map(
    (b) => {
      const threshold = b.key === 'vollstaendig' ? nonMeta.length : b.threshold;
      return { key: b.key, name: b.name, emoji: b.emoji, earned: earnedCount >= threshold };
    },
  );

  return [...evaluated, ...metaBadges];
}
