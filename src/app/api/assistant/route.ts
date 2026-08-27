import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { runAssistant, type ChatMsg } from '@/features/assistant/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Chat endpoint for the internal AI assistant. Agency staff only. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }

  let body: { messages?: unknown };
  try {
    body = (await request.json()) as { messages?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatMsg[] = raw
    .filter(
      (m): m is ChatMsg =>
        !!m &&
        typeof (m as ChatMsg).content === 'string' &&
        ((m as ChatMsg).role === 'user' || (m as ChatMsg).role === 'assistant'),
    )
    .slice(-20);

  if (messages.length === 0) {
    return NextResponse.json({ error: 'no messages' }, { status: 400 });
  }

  const { reply } = await runAssistant(messages);
  return NextResponse.json({ reply });
}
