'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { CreateProjectForm } from '@/features/projects/components/create-project-form';
import { de } from '@/lib/i18n/de';

interface Company {
  id: string;
  name: string;
}

/** "+ Neues Projekt" button that opens the create form in a modal. */
export function CreateProjectDialog({
  orgId,
  clientCompanies,
}: {
  orgId: string;
  clientCompanies: Company[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        + {de.projects.newProject}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={de.projects.create}
      >
        <CreateProjectForm orgId={orgId} clientCompanies={clientCompanies} />
      </Modal>
    </>
  );
}
