/**
 * Level-Hub-Profilrahmen ("Frames").
 *
 * Hochgeladene PNG/SVG-Rahmen, die im Level Hub den XP-Ring um das Profilbild
 * ersetzen. Jeder Rahmen wird durch ein Level freigeschaltet ODER ist exklusiv
 * (Sonderrahmen – nur über Lootboxen erhältlich). Anders als bei den
 * Titelbildern gibt es KEINEN Standardrahmen: ohne bewusste Wahl bleibt der
 * XP-Ring sichtbar (resolveActiveFrame → null).
 *
 * In der DB steht pro Profil nur der Schlüssel (`profiles.hub_frame`); die
 * konkrete Bilddatei liegt im "files"-Bucket.
 */

const FRAME_PREFIX = 'frameimg:';

/** Ein pro Organisation hochgeladener Profilrahmen. */
export interface CustomFrame {
  id: string;
  name: string;
  unlockLevel: number;
  /** Nur über Lootbox erhältlich (nicht per Level freischaltbar). */
  exclusive?: boolean;
  /** Ob die betrachtete Person diesen Rahmen besitzt (gekauft/gewonnen). */
  owned?: boolean;
  /** Coin-Preis, um ihn vorzeitig (vor dem Level) zu kaufen. 0 = nicht kaufbar. */
  coinPrice?: number;
}

/** Rahmen-Schlüssel für ein hochgeladenes Bild (z. B. "frameimg:<uuid>"). */
export function customFrameKey(id: string): string {
  return `${FRAME_PREFIX}${id}`;
}

/** Bild-ID aus einem Rahmen-Schlüssel, oder null. */
export function parseFrameKey(key: string | null | undefined): string | null {
  return key && key.startsWith(FRAME_PREFIX) ? key.slice(FRAME_PREFIX.length) : null;
}

/** Serving-URL für einen hochgeladenen Profilrahmen. */
export function frameImageUrl(id: string): string {
  return `/api/hub-frames/${id}`;
}

/** Ein anzeigbarer Profilrahmen. */
export interface ResolvedFrame {
  id: string;
  key: string;
  name: string;
  unlockLevel: number;
  imageUrl: string;
  exclusive: boolean;
  owned: boolean;
  coinPrice: number;
}

/** Wandelt die DB-Rahmen in anzeigbare Rahmen um. */
export function allFrames(customFrames: CustomFrame[]): ResolvedFrame[] {
  return customFrames.map((c) => ({
    id: c.id,
    key: customFrameKey(c.id),
    name: c.name,
    unlockLevel: c.unlockLevel,
    imageUrl: frameImageUrl(c.id),
    exclusive: Boolean(c.exclusive),
    owned: Boolean(c.owned),
    coinPrice: c.coinPrice ?? 0,
  }));
}

/**
 * Ist ein Rahmen für die Person nutzbar? Exklusive nur bei Besitz, alle anderen
 * ab dem Freischalt-Level.
 */
export function isFrameAvailable(f: ResolvedFrame, level: number): boolean {
  if (f.owned) return true; // gekauft oder gewonnen → immer nutzbar
  return f.exclusive ? false : level >= f.unlockLevel;
}

/**
 * Wählt den tatsächlich anzuzeigenden Rahmen: die bewusste Wahl der Person,
 * falls nutzbar. Ohne Wahl (oder gesperrt) → null, dann bleibt der XP-Ring.
 * Explizit gewählte exklusive Rahmen werden immer gezeigt (die Wahl war nur bei
 * Besitz möglich) – so rendert auch die Kollegen-Ansicht korrekt.
 */
export function resolveActiveFrame(
  selected: string | null | undefined,
  level: number,
  customFrames: CustomFrame[],
): ResolvedFrame | null {
  const id = parseFrameKey(selected);
  if (!id) return null;
  const frame = allFrames(customFrames).find((f) => f.id === id);
  if (!frame) return null;
  if (isFrameAvailable(frame, level) || frame.exclusive) return frame;
  return null;
}
