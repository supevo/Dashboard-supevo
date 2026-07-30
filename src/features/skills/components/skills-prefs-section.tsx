import { SkillBar } from '@/features/skills/components/skill-bar';
import { SKILL_GROUPS, SKILL_CATALOG } from '@/features/skills/catalog';
import type { Skill } from '@/features/skills/queries';
import type { WorkPreference } from '@/features/preferences/queries';

/**
 * Combined self-assessment: for each catalog item, a blue competence bar
 * (0–10 → employee_skills) and a red "Lieblingsarbeit" bar (0–10 →
 * work_preferences) sit under the same name. One list instead of two separate
 * editors.
 */
export function SkillsPrefsSection({
  skills,
  preferences,
}: {
  skills: Skill[];
  preferences: WorkPreference[];
}) {
  const skillByName = new Map(skills.map((s) => [s.name, s.level] as const));
  const prefByName = new Map(preferences.map((p) => [p.name, p.level] as const));

  // Custom items (not in the catalog) from either list.
  const extraNames = [
    ...new Set(
      [...skills, ...preferences]
        .map((x) => x.name)
        .filter((n) => !SKILL_CATALOG.includes(n)),
    ),
  ];

  const Row = ({ name }: { name: string }) => (
    <div className="py-2">
      <div className="mb-0.5 text-sm font-medium">{name}</div>
      <SkillBar name={name} variant="skill" label="Fähigkeit" initialLevel={skillByName.get(name) ?? 0} />
      <SkillBar name={name} variant="preference" label="Lieblingsarbeit" initialLevel={prefByName.get(name) ?? 0} />
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Bewerte je Bereich, wie gut du es <span className="text-primary">kannst</span> (blau)
        und wie gern du es <span className="text-rose-500">machst</span> (rot). Beides fließt
        in die smarte Aufgabenverteilung ein.
      </p>

      {SKILL_GROUPS.map((group) => (
        <div key={group.title} className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </div>
          <div className="divide-y">
            {group.skills.map((name) => (
              <Row key={name} name={name} />
            ))}
          </div>
        </div>
      ))}

      {extraNames.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Weitere
          </div>
          <div className="divide-y">
            {extraNames.map((name) => (
              <Row key={name} name={name} />
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Tipp: Klicke einen Balken an, um den Wert zu setzen – nochmal auf denselben Wert klicken
        setzt ihn auf 0 zurück.
      </p>
    </div>
  );
}
