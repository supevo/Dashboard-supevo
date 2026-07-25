import 'server-only';
import { logger } from '@/lib/logger';

/**
 * Provider-agnostic text completion for the app's AI features.
 *
 * Two interchangeable backends, selected by whichever API key is configured:
 *   1. Google Gemini  — set GEMINI_API_KEY (or GOOGLE_AI_API_KEY).
 *   2. Anthropic Claude — set ANTHROPIC_API_KEY.
 * Gemini wins if both are set. Without any key, isAiEnabled() is false and
 * callers skip AI generation entirely, so the app runs without configuration.
 *
 * The model is overridable via AI_MODEL. Defaults are cheap models suited to a
 * frequent per-employee briefing.
 */

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';

export interface CompleteInput {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export interface CompleteResult {
  text: string;
  model: string;
}

function googleKey(): string | null {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    null
  );
}

function anthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY || null;
}

export function isAiEnabled(): boolean {
  return Boolean(googleKey() || anthropicKey());
}

/** Returns a short label of the active provider/model, for display/debugging. */
export function aiModelLabel(): string | null {
  if (googleKey()) return process.env.AI_MODEL || DEFAULT_GEMINI_MODEL;
  if (anthropicKey()) return process.env.AI_MODEL || DEFAULT_CLAUDE_MODEL;
  return null;
}

async function completeGemini(
  apiKey: string,
  { system, prompt, maxTokens = 1024 }: CompleteInput,
): Promise<CompleteResult | null> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.AI_MODEL || DEFAULT_GEMINI_MODEL;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      maxOutputTokens: maxTokens,
      // Disable "thinking" on Flash: this is a simple summarization task, and
      // thinking would otherwise consume the output-token budget.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const text = response.text ?? '';
  if (!text) return null;
  return { text, model };
}

async function completeClaude(
  { system, prompt, maxTokens = 1024 }: CompleteInput,
): Promise<CompleteResult | null> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const model = process.env.AI_MODEL || DEFAULT_CLAUDE_MODEL;

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = message.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('');
  if (!text) return null;
  return { text, model };
}

/**
 * Generates a completion via the configured provider. Returns null when AI is
 * disabled or the call fails, so callers can fall back gracefully.
 */
export async function completeText(
  input: CompleteInput,
): Promise<CompleteResult | null> {
  try {
    const gKey = googleKey();
    if (gKey) return await completeGemini(gKey, input);
    const aKey = anthropicKey();
    if (aKey) return await completeClaude(input);
    return null;
  } catch (error) {
    logger.error('ai completion failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
