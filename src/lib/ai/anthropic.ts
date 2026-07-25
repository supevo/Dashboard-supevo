import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Thin wrapper around the Anthropic SDK.
 *
 * The feature degrades gracefully: when ANTHROPIC_API_KEY is not set, isAiEnabled()
 * returns false and callers skip AI generation entirely, so the app keeps working
 * without any AI configuration.
 *
 * The model is overridable via ANTHROPIC_BRIEFING_MODEL. The default is a capable
 * model; set it to `claude-haiku-4-5` (cheaper) or `claude-sonnet-5` to trade cost
 * against quality for the daily per-employee briefing.
 */

const DEFAULT_MODEL = 'claude-opus-5';

export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function briefingModel(): string {
  return process.env.ANTHROPIC_BRIEFING_MODEL?.trim() || DEFAULT_MODEL;
}

let cached: Anthropic | null = null;

/** Returns a shared Anthropic client, or null when no API key is configured. */
export function getAnthropicClient(): Anthropic | null {
  if (!isAiEnabled()) return null;
  cached ??= new Anthropic();
  return cached;
}

/** Concatenates the text blocks of a Messages API response. */
export function messageText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
