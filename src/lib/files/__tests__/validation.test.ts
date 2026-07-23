import { describe, it, expect } from 'vitest';
import {
  validateUpload,
  sanitizeFileName,
  buildStoragePath,
  DEFAULT_MAX_SIZE_BYTES,
} from '@/lib/files/validation';

describe('validateUpload', () => {
  it('accepts an allowed file within limits', () => {
    expect(validateUpload({ size: 1024, type: 'application/pdf' })).toBeNull();
  });
  it('rejects empty files', () => {
    expect(validateUpload({ size: 0, type: 'application/pdf' })).toBe('EMPTY');
  });
  it('rejects oversized files', () => {
    expect(
      validateUpload({ size: DEFAULT_MAX_SIZE_BYTES + 1, type: 'image/png' }),
    ).toBe('TOO_LARGE');
  });
  it('rejects disallowed mime types', () => {
    expect(
      validateUpload({ size: 100, type: 'application/x-msdownload' }),
    ).toBe('MIME_NOT_ALLOWED');
  });
});

describe('sanitizeFileName', () => {
  it('strips path separators and dangerous characters', () => {
    expect(sanitizeFileName('../../etc/passwd')).not.toContain('/');
    expect(sanitizeFileName('a b<>:c.png')).toBe('a_bc.png');
  });
  it('falls back for empty results', () => {
    expect(sanitizeFileName('///')).toBe('datei');
  });
});

describe('buildStoragePath', () => {
  it('builds a tenant-scoped, server-controlled key', () => {
    const path = buildStoragePath({
      organizationId: 'org-1',
      projectId: 'proj-1',
      taskId: 'task-1',
      uuid: 'uuid-1',
      fileName: 'Report Final.pdf',
    });
    expect(path).toBe(
      'org/org-1/project/proj-1/task/task-1/uuid-1_Report_Final.pdf',
    );
  });
  it('uses a general segment without a task', () => {
    const path = buildStoragePath({
      organizationId: 'o',
      projectId: 'p',
      taskId: null,
      uuid: 'u',
      fileName: 'x.png',
    });
    expect(path).toContain('/general/');
  });
});
