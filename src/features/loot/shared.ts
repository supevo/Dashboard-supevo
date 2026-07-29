// Client-safe loot constants & helpers (no server-only imports). Shared by the
// server queries/actions and the client reward/admin components.

export type BoxTier = 'common' | 'rare' | 'super';

/** Weight bounds surfaced in the admin UI (1 = very rare … 100 = very common). */
export const WEIGHT_MIN = 1;
export const WEIGHT_MAX = 100;

/** Image URL for a loot item's photo (served through the API route). */
export const lootItemImageUrl = (id: string) => `/api/loot/items/${id}/image`;
/** Image URL for a won inventory item's photo snapshot. */
export const inventoryImageUrl = (id: string) => `/api/loot/inventory/${id}/image`;
/** Image URL for a box's artwork (per tier). */
export const boxArtUrl = (tier: BoxTier) => `/api/loot/box-art/${tier}`;
/** Video URL for a box's opening animation (per tier). */
export const boxVideoUrl = (tier: BoxTier) => `/api/loot/box-video/${tier}`;
