import { requireSuperAdminPage } from '@/lib/authz/page-guards';
import { isAiEnabled } from '@/lib/ai/complete';
import { listCeoTasks } from '@/features/ceo/queries';
import { CeoBoard } from '@/features/ceo/components/ceo-board';
import { CoachPanel } from '@/features/ceo/components/coach-panel';
import { Briefcase } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * GF-Cockpit – privates Geschäftsführer-Board (Super-Admin only). Phase 1:
 * Kanban mit Eisenhower-Einordnung und Tages-Kapazität. Der KI-Coach (Phase 2)
 * plant später aus diesen Karten einen 8-Stunden-Tagesablauf.
 */
export default async function GfCockpitPage() {
  const { user } = await requireSuperAdminPage();
  const firstName = (user.fullName ?? '').trim().split(/\s+/)[0] || undefined;
  const tasks = await listCeoTasks();
  const aiOn = isAiEnabled();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Briefcase className="h-6 w-6" />
          GF-Cockpit
        </h1>
        <p className="text-sm text-muted-foreground">
          {firstName ? `${firstName}, dein` : 'Dein'} privates Board als
          Geschäftsführer – getrennt von den Team-Aufgaben. Ordne jede Karte nach
          Eisenhower ein und schätze den Aufwand; die Spalte „Heute“ zeigt dir, ob
          du in deinem 8-Stunden-Rahmen bleibst.
        </p>
      </div>

      {aiOn && <CoachPanel firstName={firstName} />}

      <CeoBoard tasks={tasks} />
    </div>
  );
}
