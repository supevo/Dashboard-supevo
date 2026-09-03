/**
 * Pure, testable upload validation rules. The upload route enforces these
 * server-side before writing to storage. Configurable defaults can be
 * overridden per organization (organizations.settings) later.
 */

export const DEFAULT_MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const DEFAULT_ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
  // Audio (Sprachnachrichten, Musik, Podcasts …)
  'audio/mpeg', // .mp3
  'audio/mp3', // manche Browser melden mp3 so
  'audio/mp4', // .m4a
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
] as const;

export interface UploadConstraints {
  maxSizeBytes: number;
  allowedMime: readonly string[];
}

export const DEFAULT_CONSTRAINTS: UploadConstraints = {
  maxSizeBytes: DEFAULT_MAX_SIZE_BYTES,
  allowedMime: DEFAULT_ALLOWED_MIME,
};

export type UploadValidationError =
  | 'EMPTY'
  | 'TOO_LARGE'
  | 'MIME_NOT_ALLOWED';

export function validateUpload(
  file: { size: number; type: string },
  constraints: UploadConstraints = DEFAULT_CONSTRAINTS,
): UploadValidationError | null {
  if (file.size <= 0) return 'EMPTY';
  if (file.size > constraints.maxSizeBytes) return 'TOO_LARGE';
  if (!constraints.allowedMime.includes(file.type)) return 'MIME_NOT_ALLOWED';
  return null;
}

/**
 * Sanitizes an original file name for display/storage suffix. Strips path
 * separators and control characters, collapses whitespace, and limits length.
 * The stored object key never trusts this value directly (see buildStoragePath).
 */
export function sanitizeFileName(name: string): string {
  const base = name
    .replace(/[/\\]+/g, '_')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 120);
  return base.length > 0 ? base : 'datei';
}

/**
 * Builds a server-controlled storage object key. The client never supplies the
 * path, preventing path-traversal and cross-tenant writes.
 * Convention: org/{orgId}/project/{projectId}/{taskSeg}/{uuid}_{sanitizedName}
 */
export function buildStoragePath(params: {
  organizationId: string;
  projectId: string;
  taskId?: string | null;
  uuid: string;
  fileName: string;
}): string {
  const { organizationId, projectId, taskId, uuid, fileName } = params;
  const taskSeg = taskId ? `task/${taskId}` : 'general';
  return `org/${organizationId}/project/${projectId}/${taskSeg}/${uuid}_${sanitizeFileName(
    fileName,
  )}`;
}
