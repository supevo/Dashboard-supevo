import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isAiEnabled } from '@/lib/ai/complete';
import { AssistantChat } from '@/features/assistant/components/assistant-chat';
import { AssistantIcon } from '@/features/assistant/components/assistant-icon';
import { Alert } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

export default async function AssistantPage() {
  const { user } = await requireAgencyPage();
  const aiOn = isAiEnabled();
  const firstName = (user.fullName ?? '').trim().split(/\s+/)[0] || undefined;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <AssistantIcon className="h-7 w-[2rem]" />
          Assistent
        </h1>
        <p className="text-sm text-muted-foreground">
          Sag in eigenen Worten, was angelegt oder geändert werden soll – Aufgaben,
          Zuweisungen, Kunden, Kontaktdaten, Zugänge oder Mitgliedschafts-Module.
          Der Assistent handelt mit deinen Rechten.
        </p>
      </div>

      {!aiOn && (
        <Alert variant="destructive">
          Die KI ist derzeit nicht aktiviert (kein API-Schlüssel hinterlegt). Bitte
          OPENAI_API_KEY in den Umgebungsvariablen setzen.
        </Alert>
      )}

      <AssistantChat firstName={firstName} />
    </div>
  );
}
