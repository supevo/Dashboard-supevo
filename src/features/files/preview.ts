/**
 * Pure preview helpers safe to import from both client and server code.
 */

const PREVIEWABLE_PREFIXES = ['image/', 'video/'];

/** Whether a MIME type can be shown inline in the preview popup. */
export function isPreviewable(mime: string): boolean {
  return (
    mime === 'application/pdf' ||
    PREVIEWABLE_PREFIXES.some((p) => mime.startsWith(p))
  );
}

/** Whether a file is an image (used for visual proofing / annotations). */
export function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}
