import { requireClientPage } from '@/lib/authz/page-guards';
import { listMyAppointments } from '@/features/appointments/queries';
import { AppointmentPanel } from '@/features/appointments/components/appointment-panel';

export const dynamic = 'force-dynamic';

export default async function PortalAppointmentsPage() {
  await requireClientPage();
  const requests = await listMyAppointments();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Termine</h1>
        <p className="text-sm text-muted-foreground">
          Fragt einen Termin mit eurem Team an.
        </p>
      </div>
      <AppointmentPanel requests={requests} />
    </div>
  );
}
