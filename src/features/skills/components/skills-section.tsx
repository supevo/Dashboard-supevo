import { SkillBar } from '@/features/skills/components/skill-bar';
import { SKILL_GROUPS, SKILL_CATALOG } from '@/features/skills/catalog';
import { de } from '@/lib/i18n/de';
import type { Skill } from '@/features/skills/queries';

/**
 * Skill self-assessment: a predefined catalog (media design + online marketing)
 * with clickable level bars. Any custom skills the user already has that are not
 * in the catalog are shown under "Weitere".
 */
export function SkillsSection({ skills }: { skills: Skill[] }) {
  const levelByName = new Map(skills.map((s) => [s.name, s.level] as const));
  const extra = skills.filter((s) => !SKILL_CATALOG.includes(s.name));

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{de.skills.hint}</p>

      {SKILL_GROUPS.map((group) => (
        <div key={group.title} className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </div>
          <div className="divide-y">
            {group.skills.map((name) => (
              <SkillBar
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
            {extra.map((s) => (
              <SkillBar key={s.id} name={s.name} initialLevel={s.level} />
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{de.skills.barHint}</p>
    </div>
  );
}
