import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import { listFeedback } from '@/features/feedback/queries';
import { FeedbackBoard } from '@/features/feedback/components/feedback-board';

export const dynamic = 'force-dynamic';

export default async function FeedbackPage() {
  const { orgId } = await requireOrgAdminPage();
  const items = await listFeedback(orgId);

  const bugs = items.filter((i) => i.kind === 'bug').length;
  const ideas = items.filter((i) => i.kind === 'idea').length;
  const wishes = items.filter((i) => i.kind === 'wish').length;
  const open = items.filter(
    (i) => i.status !== 'done' && i.status !== 'rejected',
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">💬 Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Fehler, Ideen und Wünsche von Team &amp; Kunden. Nach Status sortieren
          und Notizen bzw. Prompts festhalten.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {open} offen · 🐞 {bugs} · 💡 {ideas} · ⭐ {wishes}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Board</CardTitle>
        </CardHeader>
        <CardContent>
          <FeedbackBoard items={items} />
        </CardContent>
      </Card>
    </div>
  );
}
