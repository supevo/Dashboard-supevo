import { requireClientPage } from '@/lib/authz/page-guards';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import {
  listInquiries,
  isInquiryInboxEnabled,
  type WebInquiry,
} from '@/features/inquiries/queries';
import { InquiryList } from '@/features/inquiries/components/inquiry-list';
import { Alert } from '@/components/ui/alert';
import { de } from '@/lib/i18n/de';

export default async function ClientInquiriesPage() {
  await requireClientPage();
  const company = await getMyClientCompany();
  let inquiries: WebInquiry[] = [];
  let enabled = false;
  if (company) {
    [inquiries, enabled] = await Promise.all([
      listInquiries(company.clientCompanyId),
      isInquiryInboxEnabled(company.clientCompanyId),
    ]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de.inquiries.title}</h1>
        <p className="text-muted-foreground">{de.inquiries.subtitle}</p>
      </div>

      {!enabled && inquiries.length === 0 && (
        <Alert>{de.inquiries.inactiveNotice}</Alert>
      )}

      <InquiryList inquiries={inquiries} />
    </div>
  );
}
