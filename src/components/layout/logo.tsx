/**
 * Wortmarke. Zeigt das dunkle Logo auf hellen Hintergründen und das helle in der
 * Dark-Ansicht. Sind eigene Logos hinterlegt (Org-Branding), werden diese genutzt,
 * sonst die Standard-supevo-SVGs aus /public.
 */
export function Logo({
  className = 'h-7',
  dark,
  light,
}: {
  className?: string;
  /** Dunkles Logo (für helle Hintergründe), data-URI oder null. */
  dark?: string | null;
  /** Helles Logo (für dunkle Hintergründe), data-URI oder null. */
  light?: string | null;
}) {
  const darkSrc = dark || '/supevo-logo-dark.svg';
  const lightSrc = light || '/supevo-logo-white.svg';
  return (
    <span className="inline-flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={darkSrc}
        alt="Logo"
        className={`block w-auto dark:hidden ${className}`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={lightSrc}
        alt="Logo"
        className={`hidden w-auto dark:block ${className}`}
      />
    </span>
  );
}
