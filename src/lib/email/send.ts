import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '@/lib/logger';

/**
 * Transactional-email sender with two interchangeable backends:
 *
 *  1. SMTP (nodemailer) — set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS to reuse
 *     an existing mailbox (e.g. the same SMTP configured for Supabase Auth).
 *  2. Resend HTTP API — set RESEND_API_KEY as an alternative.
 *
 * EMAIL_FROM is required for either backend. When nothing is configured,
 * sending is a logged no-op so the app keeps working without email.
 */

interface EmailAttachment {
  filename: string;
  content: Buffer;
}

interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

function fromAddress(): string | null {
  return process.env.EMAIL_FROM ?? null;
}

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = fromAddress();
  if (!host || !user || !pass || !from) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  // Port 465 implies implicit TLS; STARTTLS (587) otherwise. Overridable.
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === 'true'
    : port === 465;
  return { host, port, secure, user, pass, from };
}

function resendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = fromAddress();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

/** Whether any email backend is configured. */
export function isEmailEnabled(): boolean {
  return smtpConfig() !== null || resendConfig() !== null;
}

let cachedTransport: Transporter | null = null;
function transporter(cfg: NonNullable<ReturnType<typeof smtpConfig>>) {
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });
  }
  return cachedTransport;
}

export interface SendResult {
  ok: boolean;
  /** Human-readable reason when ok = false (surfaceable to admins). */
  error?: string;
}

async function sendViaSmtp(
  cfg: NonNullable<ReturnType<typeof smtpConfig>>,
  input: SendEmailInput,
): Promise<SendResult> {
  try {
    await transporter(cfg).sendMail({
      from: cfg.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });
    return { ok: true };
  } catch (e) {
    const error = (e as Error).message;
    logger.warn('email.smtp.error', { error });
    return { ok: false, error: `SMTP: ${error}` };
  }
}

async function sendViaResend(
  cfg: NonNullable<ReturnType<typeof resendConfig>>,
  input: SendEmailInput,
): Promise<SendResult> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: cfg.from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString('base64'),
        })),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.warn('email.resend.failed', {
        status: res.status,
        detail: detail.slice(0, 300),
      });
      return { ok: false, error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    const error = (e as Error).message;
    logger.warn('email.resend.error', { error });
    return { ok: false, error: `Resend: ${error}` };
  }
}

/** Sends one email via the configured backend, returning the failure reason. */
export async function sendEmailResult(input: SendEmailInput): Promise<SendResult> {
  const smtp = smtpConfig();
  if (smtp) return sendViaSmtp(smtp, input);

  const resend = resendConfig();
  if (resend) return sendViaResend(resend, input);

  logger.debug('email.skip.not_configured', { subject: input.subject });
  return { ok: false, error: 'E-Mail-Versand ist nicht konfiguriert.' };
}

/** Sends one email via the configured backend. Returns true on success. */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  return (await sendEmailResult(input)).ok;
}
