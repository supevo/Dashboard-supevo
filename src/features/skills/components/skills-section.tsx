'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  addSkillAction,
  updateSkillLevelAction,
  removeSkillAction,
} from '@/features/skills/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import type { Skill } from '@/features/skills/queries';

const LEVELS = Array.from({ length: 11 }, (_, i) => i); // 0..10

function SkillRow({ skill }: { skill: Skill }) {
  const [updateState, updateAction] = useActionState(
    updateSkillLevelAction,
    idleResult,
  );
  const [, removeAction] = useActionState(removeSkillAction, idleResult);
  const router = useRouter();
  const levelFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (updateState.status === 'success') router.refresh();
  }, [updateState, router]);

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm">{skill.name}</span>

      {/* Visual level bar */}
      <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-muted sm:block">
        <div
          className="h-full bg-primary"
          style={{ width: `${skill.level * 10}%` }}
        />
      </div>

      <form ref={levelFormRef} action={updateAction}>
        <input type="hidden" name="skillId" value={skill.id} />
        <Select
          name="level"
          defaultValue={String(skill.level)}
          onChange={() => levelFormRef.current?.requestSubmit()}
          className="h-8 w-auto text-sm"
          aria-label={de.skills.level}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}/10
            </option>
          ))}
        </Select>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="skillId" value={skill.id} />
        <SubmitButton variant="ghost" size="sm" aria-label={de.skills.remove}>
          ✕
        </SubmitButton>
      </form>
    </div>
  );
}

export function SkillsSection({ skills }: { skills: Skill[] }) {
  const [addState, addAction] = useActionState(addSkillAction, idleResult);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (addState.status === 'success') {
      formRef.current?.reset();
      router.refresh();
    }
  }, [addState, router]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{de.skills.hint}</p>

      {addState.status === 'error' && (
        <Alert variant="destructive">{addState.message}</Alert>
      )}

      {skills.length > 0 ? (
        <div className="divide-y">
          {skills.map((s) => (
            <SkillRow key={s.id} skill={s} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{de.skills.empty}</p>
      )}

      <form
        ref={formRef}
        action={addAction}
        className="flex flex-wrap items-end gap-2 border-t pt-3"
      >
        <div className="flex-1">
          <Input
            name="name"
            placeholder={de.skills.namePlaceholder}
            required
            className="h-9"
          />
        </div>
        <Select name="level" defaultValue="5" className="h-9 w-auto">
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}/10
            </option>
          ))}
        </Select>
        <SubmitButton size="sm">{de.skills.add}</SubmitButton>
      </form>
    </div>
  );
}
