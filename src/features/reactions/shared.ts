// Client-safe reaction constants (no server-only imports).

/** The emojis a client can pick from to react to a delivered result. */
export const REACTION_EMOJIS = ['👍', '❤️', '🎉', '🙌', '🔥'] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isReactionEmoji(v: string): v is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(v);
}
