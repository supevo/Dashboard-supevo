'use client';

let ctx: AudioContext | null = null;

/**
 * Plays a short two-note "ping" for an incoming chat message via the Web Audio
 * API (no asset needed). Browsers may keep the audio context suspended until the
 * first user interaction; we resume it best-effort. Never throws.
 */
export function playChatPing(): void {
  if (typeof window === 'undefined') return;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    ctx = ctx ?? new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    const note = (freq: number, start: number, dur: number) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.14, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx!.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    };
    note(880, 0, 0.16); // A5
    note(1174, 0.12, 0.2); // D6
  } catch {
    /* audio unavailable — silent */
  }
}
