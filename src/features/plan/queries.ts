import 'server-only';
import {
  gatherBriefingContext,
  type BriefingTask,
} from '@/features/briefing/context';

export interface PlanItem {
  taskId: string;
  projectId: string;
  title: string;
  clientName: string | null;
  /** Abgeleitetes Fachgebiet (z. B. „Google Ads") – aus dem Titel. */
  category: string;
  /** „Überfällig" | „Heute" | „Morgen" | „Diese Woche" | null. */
  dueLabel: string | null;
  /** Nicht blockiert → sofort machbar. */
  ready: boolean;
  /** Schon mir zugewiesen? (sonst „übernehmbar"). */
  mine: boolean;
  reason: string;
  recommended: boolean;
}

interface CategoryRule {
  label: string;
  skill: string;
  kws: string[];
}

// Grobe Zuordnung Titel → Fachgebiet + passender Katalog-Skill (für „passt zu
// deiner Stärke"). Keyword-basiert, bewusst simpel – kein KI-Call.
const CATEGORY_RULES: CategoryRule[] = [
  { label: 'Google Ads', skill: 'Google Ads (SEA)', kws: ['google ads', 'adwords', ' sea', 'performance max', 'pmax', 'shopping ads'] },
  { label: 'SEO', skill: 'SEO', kws: ['seo', 'suchmaschinen', 'ranking', 'onpage', 'offpage', 'keyword'] },
  { label: 'Webdesign & UI/UX', skill: 'Webdesign (UI/UX)', kws: ['webdesign', 'website', 'landingpage', 'landing page', 'ui/ux', ' ux', ' ui', 'figma', 'wireframe', 'relaunch', 'webseite'] },
  { label: 'Content & Social Media', skill: 'Content & Copywriting', kws: ['content', 'social', 'instagram', 'facebook', 'reel', 'posting', 'redaktionsplan', 'copywriting', 'text', 'blog'] },
  { label: 'Foto & Video', skill: 'Fotografie', kws: ['foto', 'shooting', 'video', 'motion', 'dreh', 'schnitt'] },
  { label: 'Grafik & Design', skill: 'Grafikdesign', kws: ['grafik', 'logo', 'flyer', 'layout', 'bildbearbeitung', 'banner', 'broschüre', 'plakat'] },
  { label: 'E-Mail-Marketing', skill: 'E-Mail-Marketing', kws: ['newsletter', 'e-mail', 'email', 'mailing'] },
];

function classify(title: string): { category: string; skill: string | null } {
  const t = ` ${title.toLowerCase()} `;
  for (const r of CATEGORY_RULES) {
    if (r.kws.some((k) => t.includes(k))) return { category: r.label, skill: r.skill };
  }
  return { category: 'Aufgabe', skill: null };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dueLabelOf(t: BriefingTask, today: string): string | null {
  if (t.dueState === 'overdue') return 'Überfällig';
  if (t.dueState === 'today') return 'Heute';
  if (t.dueDate && t.dueDate === addDays(today, 1)) return 'Morgen';
  if (t.dueState === 'soon') return 'Diese Woche';
  return null;
}

/**
 * „Dein Plan für heute": bis zu drei Aufgaben, die den Nutzer und die Kunden
 * voranbringen – gemischt aus eigenen (priorisiert) und passenden, noch nicht
 * zugewiesenen Aufgaben zum Übernehmen. Rankt nach Dringlichkeit, Machbarkeit
 * (nicht blockiert) und Skill-Passung. Nutzt die bestehende Briefing-Engine.
 */
export async function getTodayPlan(userId: string): Promise<PlanItem[]> {
  const ctx = await gatherBriefingContext(userId);
  const today = ctx.today;
  const mySkills = new Set(ctx.skills.filter((s) => s.level > 0).map((s) => s.name));

  const dueScore = (t: BriefingTask): number =>
    t.dueState === 'overdue' ? 100 : t.dueState === 'today' ? 80 : t.dueState === 'soon' ? 45 : 15;

  const candidates = [
    ...ctx.tasks.map((t) => ({ t, mine: true })),
    ...ctx.available.map((t) => ({ t, mine: false })),
  ].map(({ t, mine }) => {
    const { category, skill } = classify(t.title);
    const skillMatch = skill != null && mySkills.has(skill);
    const score =
      dueScore(t) +
      (mine ? 20 : 0) +
      (skillMatch ? 30 : 0) +
      (t.isBlocked ? -1000 : 0);
    return { t, mine, category, skill, skillMatch, score };
  });

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 3);

  return top.map((c, i) => {
    const label = dueLabelOf(c.t, today);
    const dueClause =
      c.t.dueState === 'overdue'
        ? 'Ist überfällig'
        : c.t.dueState === 'today'
          ? 'Ist heute fällig'
          : label === 'Morgen'
            ? 'Ist schon morgen fällig'
            : c.t.dueState === 'soon'
              ? 'Ist diese Woche fällig'
              : c.mine
                ? 'Steht auf deiner Liste'
                : 'Wartet auf Übernahme';
    const reason = c.skillMatch
      ? `${dueClause} und passt zu deiner Stärke „${c.category}".`
      : `${dueClause}.`;
    return {
      taskId: c.t.id,
      projectId: c.t.projectId,
      title: c.t.title,
      clientName: c.t.clientName,
      category: c.category,
      dueLabel: label,
      ready: !c.t.isBlocked,
      mine: c.mine,
      reason,
      recommended: i === 0,
    };
  });
}
