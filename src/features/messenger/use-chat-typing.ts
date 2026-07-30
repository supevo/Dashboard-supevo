'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const ACTIVE_MS = 3500; // how long a "typing" ping keeps someone shown as typing
const THROTTLE_MS = 1500; // don't broadcast more often than this while typing

/**
 * Live typing indicator for a chat channel/DM via Supabase Realtime broadcast
 * (ephemeral — no table, no migration). `notifyTyping()` is called on keystroke;
 * `typing` holds the names of the other people currently typing.
 */
export function useChatTyping(channelId: string, selfId: string, selfName: string) {
  const [typing, setTyping] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const readyRef = useRef(false);
  const lastSent = useRef(0);
  const activeRef = useRef<Map<string, { name: string; ts: number }>>(new Map());

  useEffect(() => {
    if (!channelId) return;
    const active = activeRef.current;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`chat-typing:${channelId}`, {
      config: { broadcast: { self: false } },
    });

    const recompute = () => {
      const now = Date.now();
      const names: string[] = [];
      for (const [uid, v] of active) {
        if (now - v.ts > ACTIVE_MS) active.delete(uid);
        else names.push(v.name);
      }
      setTyping(names);
    };

    channel.on('broadcast', { event: 'typing' }, (msg) => {
      const p = msg.payload as { userId?: string; name?: string };
      if (!p.userId || p.userId === selfId) return;
      active.set(p.userId, { name: p.name || 'Jemand', ts: Date.now() });
      recompute();
    });
    channel.subscribe((status) => {
      readyRef.current = status === 'SUBSCRIBED';
    });
    channelRef.current = channel;

    const iv = setInterval(recompute, 1000);
    return () => {
      clearInterval(iv);
      readyRef.current = false;
      channelRef.current = null;
      active.clear();
      void supabase.removeChannel(channel);
    };
  }, [channelId, selfId]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSent.current < THROTTLE_MS) return;
    if (!readyRef.current || !channelRef.current) return;
    lastSent.current = now;
    void channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: selfId, name: selfName },
    });
  }, [selfId, selfName]);

  return { typing, notifyTyping };
}
