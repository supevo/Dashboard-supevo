import 'server-only';
import { logger } from '@/lib/logger';

/**
 * Minimal transactional-email sender built on the Resend HTTP API (no SDK
 * dependency). Configuration is OPTIONAL: when RESEND_API_KEY or EMAIL_FROM is
 * missing, sending is a logged no-op so the app keeps working without email.
 */

interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

function emailConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

/** Whether email delivery is configured in this environment. */
export function isEmailEnabled(): boolean {
  return emailConfig() !== null;
}

/** Sends one email. Returns true on success, false on failure/not-configured. */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const config = emailConfig();
  if (!config) {
    logger.debug('email.skip.not_configured', { subject: input.subject });
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.warn('email.send.failed', { status: res.status, detail: detail.slice(0, 300) });
      return false;
    }
    return true;
  } catch (e) {
    logger.warn('email.send.error', { error: (e as Error).message });
    return false;
  }
}
