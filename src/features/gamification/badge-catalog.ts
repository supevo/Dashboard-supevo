import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCounters } from '@/features/gamification/counters';

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
  | 'dnd';

export interface BadgeDef {
  key: string;
  name: string;
  emoji: string;
  metric: BadgeMetric;
  threshold: number;
}

export const BADGE_CATALOG: BadgeDef[] = [
  // Missionen (erledigte Aufgaben)
  { key: 'first_mission', name: 'Erste Mission', emoji: '🎯', metric: 'missions', threshold: 1 },
  { key: 'missions_10', name: 'Aufgabenjäger', emoji: '🔟', metric: 'missions', threshold: 10 },
  { key: 'missions_50', name: 'Vielschaffer', emoji: '🏅', metric: 'missions', threshold: 50 },
  { key: 'missions_100', name: 'Durchstarter', emoji: '💯', metric: 'missions', threshold: 100 },
  // Aufgaben von Kollegen übernommen
  { key: 'entlaster', name: 'Entlaster', emoji: '🤝', metric: 'takenOver', threshold: 3 },
  { key: 'buddy', name: 'Buddy', emoji: '🫂', metric: 'takenOver', threshold: 10 },
  // Aufgaben erstellt
  { key: 'regler', name: 'Regler', emoji: '🎚️', metric: 'tasksCreated', threshold: 5 },
  { key: 'fliessband', name: 'Fließband', emoji: '🏭', metric: 'tasksCreated', threshold: 15 },
  // Aufgaben verschoben / bewertet
  { key: 'ordnungsfimmel', name: 'Ordnungsfimmel', emoji: '🧹', metric: 'taskMoves', threshold: 50 },
  { key: 'gedrueckt', name: 'Einfach was gedrückt', emoji: '🔘', metric: 'ratingsGiven', threshold: 50 },
  // Kunden & Projekte
  { key: 'kundenmagnet', name: 'Kundenmagnet', emoji: '🧲', metric: 'clientsCreated', threshold: 1 },
  { key: 'projektpionier', name: 'Projekt-Pionier', emoji: '🚩', metric: 'projectsCreated', threshold: 1 },
  // Chat
  { key: 'plaudertasche', name: 'Plaudertasche', emoji: '💬', metric: 'chatMessages', threshold: 25 },
  { key: 'schreibmaschine', name: 'Schreibmaschine', emoji: '⌨️', metric: 'chatMessages', threshold: 100 },
  // Zeit
  { key: 'erster_stempel', name: 'Erster Stempel', emoji: '🕐', metric: 'timerStamps', threshold: 1 },
  { key: 'stempelkoenig', name: 'Stempelkönig', emoji: '⏱️', metric: 'timerStamps', threshold: 200 },
  { key: 'urlaubsreif', name: 'Urlaubsreif', emoji: '🏖️', metric: 'vacations', threshold: 5 },
  // Profil & Style
  { key: 'profil', name: 'Profi(l)', emoji: '🧑‍💼', metric: 'profileComplete', threshold: 1 },
  { key: 'michael_jackson', name: 'Michael Jackson', emoji: '🕺', metric: 'themeToggles', threshold: 20 },
  { key: 'lass_mich_allein', name: 'Lass mich allein', emoji: '🚷', metric: 'dnd', threshold: 20 },
];

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
    counters,
  ] = await Promise.all([
    supabase.from('tasks').select('id', head).eq('completed_by', userId),
    supabase.from('tasks').select('created_by').eq('completed_by', userId),
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

  const takenOver = (completedRows.data ?? []).filter(
    (t) => t.created_by && t.created_by !== userId,
  ).length;

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
  };
  void orgId;

  return BADGE_CATALOG.map((b) => ({
    key: b.key,
    name: b.name,
    emoji: b.emoji,
    earned: (stats[b.metric] ?? 0) >= b.threshold,
  }));
}
