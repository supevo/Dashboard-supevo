import { sanitizeFileName } from './validation';

/**
 * Server-controlled storage object key for a company asset. The client never
 * supplies the path, preventing path-traversal and cross-tenant writes.
 * Convention: org/{orgId}/company/{companyId}/assets/{uuid}_{sanitizedName}
 */
export function buildAssetStoragePath(params: {
  organizationId: string;
  clientCompanyId: string;
  uuid: string;
  fileName: string;
}): string {
  const { organizationId, clientCompanyId, uuid, fileName } = params;
  return `org/${organizationId}/company/${clientCompanyId}/assets/${uuid}_${sanitizeFileName(
    fileName,
  )}`;
}
