import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireClientPage } from '@/lib/authz/page-guards';
import { getMyPlan } from '@/features/marketing-plan/queries';
import { PlanReview } from '@/features/marketing-plan/components/plan-review';

export default async function ClientPlanPage() {
  await requireClientPage();
  const plan = await getMyPlan();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🗺️ Marketingplan</h1>
        <p className="text-sm text-muted-foreground">
          Euer Jahresplan zur Abstimmung. Akzeptierte Maßnahmen setzen wir
          automatisch um.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{plan ? plan.title : 'Marketingplan'}</CardTitle>
        </CardHeader>
        <CardContent>
          {plan ? (
            <PlanReview plan={plan} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Aktuell liegt kein Marketingplan zur Abstimmung vor. Sobald wir
              einen vorbereitet haben, erscheint er hier.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
