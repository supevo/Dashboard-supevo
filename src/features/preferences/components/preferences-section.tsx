import { HeartRating } from '@/features/preferences/components/heart-rating';
import {
  SKILL_GROUPS,
  SKILL_CATALOG,
  SOFT_SKILL_GROUP,
} from '@/features/skills/catalog';
import { de } from '@/lib/i18n/de';
import type { WorkPreference } from '@/features/preferences/queries';

/**
 * Work-preference self-assessment: the fachlichen Skills, bewertet danach, wie
 * gern man die Arbeit macht (1–10 Herzen). Feeds smarter task assignment.
 * Soft Skills (persönliche Kompetenzen) gehören NICHT in die Lieblingsarbeit –
 * die Gruppe wird hier bewusst ausgeblendet.
 */
export function PreferencesSection({
  preferences,
}: {
  preferences: WorkPreference[];
}) {
  const levelByName = new Map(preferences.map((p) => [p.name, p.level] as const));
  const extra = preferences.filter((p) => !SKILL_CATALOG.includes(p.name));

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{de.preferences.hint}</p>

      {SKILL_GROUPS.filter((group) => group.title !== SOFT_SKILL_GROUP).map((group) => (
        <div key={group.title} className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </div>
          <div className="divide-y">
            {group.skills.map((name) => (
              <HeartRating
                key={name}
                name={name}
                initialLevel={levelByName.get(name) ?? 0}
              />
            ))}
          </div>
        </div>
      ))}

      {extra.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {de.skills.other}
          </div>
          <div className="divide-y">
            {extra.map((p) => (
              <HeartRating key={p.id} name={p.name} initialLevel={p.level} />
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{de.preferences.barHint}</p>
    </div>
  );
}
