'use client';

import { useEffect } from 'react';

// A little magic wand (SVG) as the cursor. Built as a data URI so it needs no
// asset. Hotspot sits at the star tip, where the sparkles fly from.
// Horizontal mirror of the wand so the star tip points to the TOP-LEFT, like a
// normal mouse pointer (hotspot at the tip). All x-coordinates are 32 − x.
const WAND_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>
  <line x1='26' y1='26' x2='12' y2='12' stroke='#7c3aed' stroke-width='3' stroke-linecap='round'/>
  <path d='M9 3 l-1.9 3.8 l-3.8 1.9 l3.8 1.9 l1.9 3.8 l1.9-3.8 l3.8-1.9 l-3.8-1.9 z' fill='#fbbf24'/>
</svg>`;
const WAND_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(WAND_SVG)}") 9 3, auto`;

const SPARKLES = ['✨', '⭐', '🌟', '💫'];

/** Spawns a burst of sparkle emojis at (x, y) that fly out and fade. */
function burst(x: number, y: number) {
  const count = 7;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.textContent = SPARKLES[i % SPARKLES.length]!;
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;pointer-events:none;z-index:9999;font-size:${
      12 + Math.random() * 12
    }px;will-change:transform,opacity;transform:translate(-50%,-50%);`;
    document.body.appendChild(el);

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const dist = 30 + Math.random() * 40;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 20; // bias upward

    el.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.3) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.2) rotate(${
            Math.random() * 180 - 90
          }deg)`,
          opacity: 0,
        },
      ],
      { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)' },
    ).onfinish = () => el.remove();
  }
}

/**
 * Turns the cursor into a magic wand and makes clicks sparkle – a small bit of
 * delight in the projects area. Cleans up when it unmounts (leaving the area).
 */
export function SparkleCursor() {
  useEffect(() => {
    const prev = document.body.style.cursor;
    document.body.style.cursor = WAND_CURSOR;
    const onClick = (e: MouseEvent) => burst(e.clientX, e.clientY);
    document.addEventListener('click', onClick);
    return () => {
      document.body.style.cursor = prev;
      document.removeEventListener('click', onClick);
    };
  }, []);
  return null;
}
