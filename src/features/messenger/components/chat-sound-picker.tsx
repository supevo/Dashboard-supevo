'use client';

import { useEffect, useState } from 'react';
import {
  CHAT_SOUNDS,
  getChatSound,
  setChatSound,
  playChatSound,
  type ChatSound,
} from '@/features/messenger/notify-sound';

/**
 * Kleine Auswahl für den Benachrichtigungston bei neuen Chat-Nachrichten
 * (pro Gerät gespeichert). Beim Wechsel wird der Ton kurz vorgespielt.
 */
export function ChatSoundPicker() {
  const [v, setV] = useState<ChatSound>('ping');
  useEffect(() => setV(getChatSound()), []);

  return (
    <select
      value={v}
      title="Ton bei neuer Nachricht"
      aria-label="Benachrichtigungston"
      onChange={(e) => {
        const s = e.target.value as ChatSound;
        setV(s);
        setChatSound(s);
        playChatSound(s); // Vorschau
      }}
      className="rounded border bg-background px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
    >
      {CHAT_SOUNDS.map((s) => (
        <option key={s.value} value={s.value}>
          🔔 {s.label}
        </option>
      ))}
    </select>
  );
}
