import 'server-only';
import { logger } from '@/lib/logger';
import { assistantTools, executeAssistantTool } from './tools';

const MODEL = process.env.AI_MODEL?.trim() || 'gpt-5.4';

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM = `Du bist der interne Assistent des supevo-Dashboards (Agentur-Software).
Du hilfst dem Team, Daten im System anzulegen und zu ändern.

Arbeitsweise:
- Sprich Deutsch, kurz und konkret.
- Löse Namen IMMER zuerst über die find_*-Werkzeuge in IDs auf ("Kunde XY" → find_client,
  Mitarbeiter → find_team_member, Projekt → list_client_projects, Aufgabe → find_task).
- Erfinde niemals IDs.
- Gibt eine Suche mehrere oder keine Treffer, frage kurz zurück, statt zu raten.
- Führe die gewünschte Änderung dann mit dem passenden Werkzeug aus und fasse am Ende in
  einem Satz zusammen, was du getan hast (oder warum nicht).
- Ein Werkzeug meldet Fehler als "Fehler: ..." – gib den Grund verständlich weiter.
- Du handelst mit den Rechten des angemeldeten Nutzers; was er nicht darf, kannst auch du nicht.`;

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Runs the OpenAI tool-calling loop until the model produces a final answer.
 * Tools execute the app's existing server actions, so authorization/RLS apply.
 */
export async function runAssistant(history: ChatMsg[]): Promise<{ reply: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { reply: 'Die KI ist nicht aktiviert (OPENAI_API_KEY fehlt).' };

  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  // Heutiges Datum (Europe/Berlin) für relative Zeitangaben wie „morgen".
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).format(new Date());

  const messages: any[] = [
    { role: 'system', content: `${SYSTEM}\n\nHeutiges Datum (Europe/Berlin): ${today}. Rechne relative Angaben (morgen, übermorgen, nächste Woche) daraus in ein konkretes Datum um.` },
    ...history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    for (let step = 0; step < 8; step++) {
      const res = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1500,
        tools: assistantTools as any,
        messages,
      } as any);

      const msg = res.choices[0]?.message;
      if (!msg) return { reply: 'Keine Antwort vom Modell.' };
      messages.push(msg);

      const calls = (msg.tool_calls ?? []) as any[];
      if (calls.length === 0) {
        return { reply: (msg.content as string) || '' };
      }

      for (const call of calls) {
        let result: string;
        try {
          const args = JSON.parse(call.function?.arguments || '{}');
          result = await executeAssistantTool(call.function?.name ?? '', args);
        } catch (e) {
          result = 'Fehler: ' + (e instanceof Error ? e.message : String(e));
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }
    return { reply: 'Abgebrochen (zu viele Schritte). Bitte formuliere die Aufgabe konkreter.' };
  } catch (e) {
    logger.error('assistant.run_failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return { reply: 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut oder formuliere es anders.' };
  }
}
