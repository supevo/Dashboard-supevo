'use client';

let ctx: AudioContext | null = null;

export type ChatSound = 'ping' | 'soft' | 'marimba' | 'blip' | 'off';

export const CHAT_SOUNDS: { value: ChatSound; label: string }[] = [
  { value: 'ping', label: 'Ping (Standard)' },
  { value: 'soft', label: 'Sanft' },
  { value: 'marimba', label: 'Marimba' },
  { value: 'blip', label: 'Blip' },
  { value: 'off', label: 'Aus' },
];

const KEY = 'chatSound';

/** Gewählter Benachrichtigungston (pro Gerät, localStorage). */
export function getChatSound(): ChatSound {
  try {
    const v = localStorage.getItem(KEY) as ChatSound | null;
    if (v && CHAT_SOUNDS.some((s) => s.value === v)) return v;
  } catch {
    /* ignore */
  }
  return 'ping';
}

export function setChatSound(v: ChatSound): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* ignore */
  }
}

/** Eine Sequenz aus Sinus-Tönen abspielen (Web Audio, kein Asset). */
function playNotes(notes: [freq: number, start: number, dur: number][], type: OscillatorType = 'sine'): void {
  if (typeof window === 'undefined') return;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = ctx ?? new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    for (const [freq, start, dur] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.14, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    }
  } catch {
    /* audio unavailable — silent */
  }
}

/** Spielt einen bestimmten Ton (für die Vorschau in der Auswahl). */
export function playChatSound(variant: ChatSound): void {
  switch (variant) {
    case 'off':
      return;
    case 'soft':
      return playNotes([[660, 0, 0.22], [880, 0.14, 0.28]], 'sine');
    case 'marimba':
      return playNotes([[784, 0, 0.14], [1046, 0.1, 0.16], [1318, 0.2, 0.22]], 'triangle');
    case 'blip':
      return playNotes([[1200, 0, 0.08], [1600, 0.07, 0.1]], 'square');
    case 'ping':
    default:
      return playNotes([[880, 0, 0.16], [1174, 0.12, 0.2]], 'sine');
  }
}

/** Plays the user's chosen incoming-message sound. Never throws. */
export function playChatPing(): void {
  playChatSound(getChatSound());
}
