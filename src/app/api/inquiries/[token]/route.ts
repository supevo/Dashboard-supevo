import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

/** Preflight for cross-origin form submissions. */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 2000);
  }
  return null;
}

/**
 * Public webhook: a client's website contact form POSTs here. The URL token is
 * the shared secret; there is no cookie auth. Accepts JSON or form-encoded
 * bodies and stores the submission as a web inquiry, then notifies the client's
 * contacts. Disabled endpoints and unknown tokens return 404.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'not found' }, { status: 404, headers: CORS_HEADERS });
  }

  const limit = rateLimit(`inquiry:${token}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { ...CORS_HEADERS, 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const service = createSupabaseServiceClient();
  const { data: endpoint } = await service
    .from('inquiry_endpoints')
    .select('client_company_id, organization_id, enabled')
    .eq('token', token)
    .maybeSingle();
  if (!endpoint || !endpoint.enabled) {
    return NextResponse.json({ error: 'not found' }, { status: 404, headers: CORS_HEADERS });
  }

  // Parse JSON or form-encoded payloads.
  let payload: Record<string, unknown> = {};
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      payload = (await request.json()) as Record<string, unknown>;
    } else {
      const form = await request.formData();
      payload = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
    }
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400, headers: CORS_HEADERS });
  }
  if (!payload || typeof payload !== 'object') payload = {};

  const name = pick(payload, ['name', 'fullname', 'full_name', 'vorname']);
  const email = pick(payload, ['email', 'e-mail', 'mail']);
  const phone = pick(payload, ['phone', 'tel', 'telefon', 'telephone']);
  const subject = pick(payload, ['subject', 'betreff', 'topic']);
  const message = pick(payload, ['message', 'nachricht', 'text', 'comments', 'body']);
  const source = pick(payload, ['source', 'page', 'url', 'form']);

  const { data: inquiry, error } = await service
    .from('web_inquiries')
    .insert({
      organization_id: endpoint.organization_id,
      client_company_id: endpoint.client_company_id,
      name,
      email,
      phone,
      subject,
      message,
      source,
      payload,
    })
    .select('id')
    .maybeSingle();
  if (error) {
    logger.error('inquiry.insert.failed', { error: error.message });
    return NextResponse.json({ error: 'server error' }, { status: 500, headers: CORS_HEADERS });
  }

  // Notify the client's contacts (best-effort).
  try {
    const { data: contacts } = await service
      .from('client_contacts')
      .select('user_id')
      .eq('client_company_id', endpoint.client_company_id);
    const recipientIds = [...new Set((contacts ?? []).map((c) => c.user_id))];
    if (recipientIds.length > 0) {
      await createNotifications(
        recipientIds.map((recipientId) => ({
          organizationId: endpoint.organization_id,
          recipientId,
          type: 'inquiry' as const,
          title: 'Neue Website-Anfrage',
          body: name ? `Von ${name}${subject ? ` – ${subject}` : ''}` : 'Neue Anfrage über Ihr Formular.',
          entityType: 'inquiry',
          entityId: inquiry?.id ?? null,
        })),
      );
    }
  } catch (e) {
    logger.warn('inquiry.notify.failed', { error: (e as Error).message });
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: CORS_HEADERS });
}
