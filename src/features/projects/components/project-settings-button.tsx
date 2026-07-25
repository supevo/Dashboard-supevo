'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { ProjectSettingsForm } from './project-settings-form';
import { de } from '@/lib/i18n/de';
import type { ProjectDetail } from '@/features/projects/queries';

/**
 * Small gear icon next to the project title that opens the project settings in
 * a modal. Only rendered for users who may manage the project.
 */
export function ProjectSettingsButton({ project }: { project: ProjectDetail }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={de.projects.settings}
        title={de.projects.settings}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Settings className="h-4 w-4" />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={de.projects.settings}
      >
        <ProjectSettingsForm
          orgId={project.organizationId}
          project={project}
          onSaved={() => router.refresh()}
        />
      </Modal>
    </>
  );
}
