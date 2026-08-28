/**
 * Downscales an image File in the browser before upload and re-encodes it to
 * WebP, so stored/served images stay small and pages load fast.
 *
 * - Animated GIFs are returned unchanged (a canvas would drop the animation).
 * - EXIF orientation is respected (imageOrientation: 'from-image').
 * - Falls back to the original file on any error or when the result would not
 *   actually be smaller (e.g. an already tiny image).
 */
export async function downscaleImage(
  file: File,
  opts: { maxDim?: number; quality?: number; type?: string } = {},
): Promise<File> {
  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.82;
  const outType = opts.type ?? 'image/webp';

  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file; // Animation erhalten

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = bitmap;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), outType, quality),
    );
    // Kein Gewinn → Original behalten.
    if (!blob || blob.size >= file.size) return file;

    const ext = outType === 'image/webp' ? 'webp' : 'jpg';
    const base = file.name.replace(/\.[^.]+$/, '') || 'cover';
    return new File([blob], `${base}.${ext}`, { type: outType });
  } catch {
    return file;
  }
}
