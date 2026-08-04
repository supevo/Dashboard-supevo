import { SparkleCursor } from '@/features/fun/sparkle-cursor';

/** Adds the magic-wand cursor + click sparkles across the projects area. */
export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SparkleCursor />
      {children}
    </>
  );
}
