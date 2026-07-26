import 'server-only';
import { logger } from '@/lib/logger';

/**
 * Provider-agnostic text completion for the app's AI features.
 *
 * Three interchangeable backends, selected by whichever API key is configured:
 *   1. OpenAI          — set OPENAI_API_KEY.
 *   2. Google Gemini   — set GEMINI_API_KEY (or GOOGLE_AI_API_KEY).
 *   3. Anthropic Claude — set ANTHROPIC_API_KEY.
 *
 * When several keys are set, OpenAI wins, then Gemini, then Anthropic. Override
 * the choice with AI_PROVIDER = openai | gemini | anthropic. Without any key,
 * isAiEnabled() is false and callers skip AI generation entirely.
 *
 * The model is overridable via AI_MODEL (must match the active provider).
 */

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
// gemini-2.5-flash is no longer available to new API projects; 2.0-flash is
// the current broadly-available flash model. Override via AI_MODEL if needed.
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';

export type AiProvider = 'openai' | 'gemini' | 'anthropic';

export interface CompleteInput {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export interface CompleteResult {
  text: string;
  model: string;
}

function openaiKey(): string | null {
  return process.env.OPENAI_API_KEY || null;
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
  return Boolean(openaiKey() || googleKey() || anthropicKey());
}

/** Resolves the active provider from AI_PROVIDER or the first available key. */
export function activeProvider(): AiProvider | null {
  const forced = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (forced === 'openai' && openaiKey()) return 'openai';
  if (forced === 'gemini' && googleKey()) return 'gemini';
  if (forced === 'anthropic' && anthropicKey()) return 'anthropic';
  if (openaiKey()) return 'openai';
  if (googleKey()) return 'gemini';
  if (anthropicKey()) return 'anthropic';
  return null;
}

function modelFor(provider: AiProvider): string {
  const override = process.env.AI_MODEL?.trim();
  if (override) return override;
  if (provider === 'openai') return DEFAULT_OPENAI_MODEL;
  if (provider === 'gemini') return DEFAULT_GEMINI_MODEL;
  return DEFAULT_CLAUDE_MODEL;
}

/** Short label of the active provider/model, for display/debugging. */
export function aiModelLabel(): string | null {
  const p = activeProvider();
  return p ? `${p}:${modelFor(p)}` : null;
}

async function completeOpenAI(
  apiKey: string,
  { system, prompt, maxTokens = 1024 }: CompleteInput,
): Promise<CompleteResult | null> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });
  const model = modelFor('openai');
  const res = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  });
  const text = res.choices[0]?.message?.content ?? '';
  return text ? { text, model } : null;
}

async function completeGemini(
  apiKey: string,
  { system, prompt, maxTokens = 1024 }: CompleteInput,
): Promise<CompleteResult | null> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const model = modelFor('gemini');
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const text = response.text ?? '';
  return text ? { text, model } : null;
}

async function completeClaude({
  system,
  prompt,
  maxTokens = 1024,
}: CompleteInput): Promise<CompleteResult | null> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const model = modelFor('anthropic');
  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = message.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('');
  return text ? { text, model } : null;
}

/**
 * Generates a completion via the active provider. Returns null when AI is
 * disabled or the call fails, so callers can fall back gracefully.
 */
export async function completeText(
  input: CompleteInput,
): Promise<CompleteResult | null> {
  try {
    const provider = activeProvider();
    if (provider === 'openai') return await completeOpenAI(openaiKey()!, input);
    if (provider === 'gemini') return await completeGemini(googleKey()!, input);
    if (provider === 'anthropic') return await completeClaude(input);
    return null;
  } catch (error) {
    logger.error('ai completion failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Minimal live call against the active provider that surfaces the raw error
 * (for the diagnostics page). Unlike completeText it does NOT swallow errors.
 */
export async function aiSelfTest(): Promise<{
  ok: boolean;
  provider?: string;
  model?: string;
  sample?: string;
  error?: string;
}> {
  const provider = activeProvider();
  if (!provider) return { ok: false, error: 'Kein API-Schlüssel gesetzt.' };
  const model = modelFor(provider);
  const probe = 'Antworte nur mit dem Wort OK.';

  try {
    let text = '';
    if (provider === 'openai') {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: openaiKey()! });
      const res = await client.chat.completions.create({
        model,
        max_tokens: 20,
        messages: [{ role: 'user', content: probe }],
      });
      text = res.choices[0]?.message?.content ?? '';
    } else if (provider === 'gemini') {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: googleKey()! });
      const res = await ai.models.generateContent({
        model,
        contents: probe,
        config: { maxOutputTokens: 20, thinkingConfig: { thinkingBudget: 0 } },
      });
      text = res.text ?? '';
    } else {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic();
      const msg = await client.messages.create({
        model,
        max_tokens: 20,
        messages: [{ role: 'user', content: probe }],
      });
      text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    }
    text = text.trim();
    if (!text) return { ok: false, provider, model, error: 'Leere Antwort vom Modell.' };
    return { ok: true, provider, model, sample: text.slice(0, 40) };
  } catch (e) {
    return {
      ok: false,
      provider,
      model,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
