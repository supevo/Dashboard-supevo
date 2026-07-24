import 'server-only';

/** Escapes text for safe inclusion in HTML email bodies. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders a simple, self-contained branded email. Inline styles only, since
 * email clients strip <style>/external CSS.
 */
export function renderEmail(params: {
  heading: string;
  intro: string;
  bodyLines?: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  footer?: string;
}): { html: string; text: string } {
  const { heading, intro, bodyLines = [], ctaLabel, ctaUrl, footer } = params;

  const button =
    ctaLabel && ctaUrl
      ? `<tr><td style="padding:24px 0;">
           <a href="${esc(ctaUrl)}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block;">${esc(
             ctaLabel,
           )}</a>
         </td></tr>`
      : '';

  const linkFallback =
    ctaUrl && ctaLabel
      ? `<tr><td style="font-size:12px;color:#6b7280;padding-top:4px;">Falls der Button nicht funktioniert: <a href="${esc(
          ctaUrl,
        )}" style="color:#4f46e5;">${esc(ctaUrl)}</a></td></tr>`
      : '';

  const body = bodyLines
    .map(
      (l) =>
        `<tr><td style="font-size:14px;color:#374151;padding-top:8px;">${esc(l)}</td></tr>`,
    )
    .join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
      <tr><td style="font-size:18px;font-weight:700;color:#111827;">Supevo Dashboard</td></tr>
      <tr><td style="font-size:20px;font-weight:700;color:#111827;padding-top:12px;">${esc(heading)}</td></tr>
      <tr><td style="font-size:14px;color:#374151;padding-top:8px;">${esc(intro)}</td></tr>
      ${body}
      ${button}
      ${linkFallback}
      <tr><td style="font-size:12px;color:#9ca3af;padding-top:24px;border-top:1px solid #e5e7eb;">${esc(
        footer ?? 'Diese E-Mail wurde automatisch vom Supevo Dashboard versendet.',
      )}</td></tr>
    </table>
  </body></html>`;

  const text = [
    heading,
    '',
    intro,
    ...bodyLines,
    ctaUrl ? `\n${ctaLabel}: ${ctaUrl}` : '',
    '',
    footer ?? 'Diese E-Mail wurde automatisch vom Supevo Dashboard versendet.',
  ].join('\n');

  return { html, text };
}
