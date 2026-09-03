import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { isSuperAdmin } from '@/lib/authz/policies';
import { runCoach, type CoachMsg } from '@/features/ceo/coach';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Chat-Endpoint des GF-Coaches. Ausschließlich Super-Admin (Geschäftsführer). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user) || !isSuperAdmin(user)) {
    return new NextResponse(null, { status: 401 });
  }

  let body: { messages?: unknown };
  try {
    body = (await request.json()) as { messages?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: CoachMsg[] = raw
    .filter(
      (m): m is CoachMsg =>
        !!m &&
        typeof (m as CoachMsg).content === 'string' &&
        ((m as CoachMsg).role === 'user' || (m as CoachMsg).role === 'assistant'),
    )
    .map((m) => ({ role: m.role, content: m.content }))
    .slice(-20);

  if (messages.length === 0) {
    return NextResponse.json({ error: 'no messages' }, { status: 400 });
  }

  const { reply } = await runCoach(messages);
  return NextResponse.json({ reply });
}
