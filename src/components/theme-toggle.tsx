'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Toggles light/dark theme by setting the `dark` class on <html> and
 *  persisting the choice in localStorage. The no-flash script in the root
 *  layout applies the stored theme before paint. */
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      // ignore storage errors (private mode)
    }
    setIsDark(next);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggle}
      aria-label={isDark ? 'Hellen Modus aktivieren' : 'Dunklen Modus aktivieren'}
    >
      {isDark ? '☀️ Hell' : '🌙 Dunkel'}
    </Button>
  );
}
