/** Longest edge (px) an attached screenshot is downscaled to before sending. */
export const MAX_IMAGE_EDGE = 1280;

/**
 * Reads an image file, downscales it so the longest edge is at most
 * MAX_IMAGE_EDGE and re-encodes it as a JPEG data URL. Keeps the payload and
 * the model's vision-token cost small – a WhatsApp screenshot ends up well
 * under a few hundred KB. Falls back to the raw data URL if canvas is missing.
 *
 * Browser-only (uses FileReader/Image/canvas); call it from client components.
 */
export async function fileToDownscaledDataUrl(file: File): Promise<string> {
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
    el.src = rawUrl;
  });

  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return rawUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.72);
}
