'use client';

import { useEffect, useState } from 'react';

export interface UnlockBadge {
  key: string;
  name: string;
  emoji: string;
  reason: string;
}

/**
 * Presentational reveal animation: dims the screen, sweeps a golden glitter
 * trail, spins the badge from grey to colour and shows name + reason. Plays the
 * given badges one after another, then calls onDone. Advances on click or after
 * ~4.2s. Reused by the auto-unlock overlay and the easter-egg test badge.
 */
export function BadgeUnlockAnimation({
  badges,
  onDone,
}: {
  badges: UnlockBadge[];
  onDone?: () => void;
}) {
  const [index, setIndex] = useState(0);

  // Restart the queue whenever a new set of badges comes in.
  useEffect(() => {
    setIndex(0);
  }, [badges]);

  useEffect(() => {
    if (badges.length === 0) return;
    if (index >= badges.length) {
      onDone?.();
      return;
    }
    const t = setTimeout(() => setIndex((x) => x + 1), 4200);
    return () => clearTimeout(t);
    // onDone intentionally excluded to avoid re-arming on parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badges, index]);

  if (badges.length === 0 || index >= badges.length) return null;
  const cur = badges[index]!;

  return (
    <div
      className="bu-overlay"
      role="dialog"
      aria-label={`Badge freigeschaltet: ${cur.name}`}
      onClick={() => setIndex((x) => x + 1)}
    >
      <div className="bu-stage" key={cur.key}>
        <div className="bu-trail" />
        <div className="bu-badge">{cur.emoji}</div>
        <div className="bu-unlocked">Badge freigeschaltet!</div>
        <div className="bu-name">{cur.name}</div>
        <div className="bu-reason">{cur.reason}</div>
        {badges.length > 1 && (
          <div className="bu-count">
            {index + 1} / {badges.length}
          </div>
        )}
        <div className="bu-hint">Tippen zum Fortfahren</div>
      </div>

      <style>{`
        .bu-overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;
          background:rgba(0,0,0,.82);backdrop-filter:blur(2px);animation:bu-fade .3s ease both;cursor:pointer;}
        .bu-stage{position:relative;display:flex;flex-direction:column;align-items:center;gap:.35rem;
          padding:2.5rem 2rem;text-align:center;overflow:visible;}
        .bu-trail{position:absolute;top:34%;left:0;height:90px;width:55%;transform:translateX(-130%);pointer-events:none;
          border-radius:999px;filter:blur(7px);
          background:linear-gradient(90deg,transparent,rgba(255,223,90,.85),rgba(255,255,255,.95),rgba(255,223,90,.85),transparent);
          animation:bu-sweep 1.15s ease-out both;}
        .bu-badge{font-size:104px;line-height:1;transform:scale(.6) rotateY(0);filter:grayscale(1) brightness(.5);
          animation:bu-pop 1.15s cubic-bezier(.2,.8,.2,1) .15s both;}
        .bu-unlocked{font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:#fcd34d;opacity:0;
          animation:bu-rise .5s ease .8s both;}
        .bu-name{font-size:1.7rem;font-weight:800;color:#facc15;text-shadow:0 0 14px rgba(250,204,21,.55);opacity:0;
          animation:bu-rise .5s ease .95s both;}
        .bu-reason{color:#e5e7eb;font-size:.95rem;opacity:0;animation:bu-rise .5s ease 1.1s both;}
        .bu-count{margin-top:.5rem;font-size:.75rem;color:#d1d5db;opacity:0;animation:bu-rise .5s ease 1.25s both;}
        .bu-hint{margin-top:.75rem;font-size:.7rem;color:#9ca3af;opacity:0;animation:bu-rise .5s ease 1.5s both;}
        @keyframes bu-fade{from{opacity:0}to{opacity:1}}
        @keyframes bu-sweep{0%{transform:translateX(-130%)}100%{transform:translateX(230%)}}
        @keyframes bu-pop{
          0%{filter:grayscale(1) brightness(.5);transform:scale(.6) rotateY(0)}
          55%{filter:grayscale(.35) brightness(.95);transform:scale(1.18) rotateY(540deg)}
          100%{filter:grayscale(0) brightness(1) drop-shadow(0 0 20px rgba(250,204,21,.7));transform:scale(1) rotateY(720deg)}
        }
        @keyframes bu-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @media (prefers-reduced-motion: reduce){
          .bu-trail{display:none}
          .bu-badge{animation:none;filter:none;transform:none}
          .bu-unlocked,.bu-name,.bu-reason,.bu-count,.bu-hint{animation:none;opacity:1}
        }
      `}</style>
    </div>
  );
}
