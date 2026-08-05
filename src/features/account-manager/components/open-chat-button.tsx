'use client';

import { OPEN_CLIENT_CHAT_EVENT } from '@/features/messenger/components/client-chat-dock';

/** Opens the floating client chat dock via a window event. */
export function OpenChatButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CLIENT_CHAT_EVENT))}
      className={
        className ??
        'rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90'
      }
    >
      💬 Chat starten
    </button>
  );
}
