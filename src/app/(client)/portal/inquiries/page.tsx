import { requireClientPage } from '@/lib/authz/page-guards';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import {
  listInquiries,
  isInquiryClientVisible,
  type WebInquiry,
} from '@/features/inquiries/queries';
import { InquiryKanban } from '@/features/inquiries/components/inquiry-kanban';
import { Alert } from '@/components/ui/alert';
import { de } from '@/lib/i18n/de';

export default async function ClientInquiriesPage() {
  await requireClientPage();
  const company = await getMyClientCompany();
  let inquiries: WebInquiry[] = [];
  let visible = false;
  if (company) {
    [inquiries, visible] = await Promise.all([
      listInquiries(company.clientCompanyId),
      isInquiryClientVisible(company.clientCompanyId),
    ]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Kundenanfragen</h1>
        <p className="text-muted-foreground">{de.inquiries.subtitle}</p>
      </div>

      {!visible ? (
        <Alert>{de.inquiries.inactiveNotice}</Alert>
      ) : (
        <InquiryKanban inquiries={inquiries} />
      )}
    </div>
  );
}
