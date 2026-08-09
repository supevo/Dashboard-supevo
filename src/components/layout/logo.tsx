/**
 * supevo wordmark. Shows the dark logo on light backgrounds and the white logo
 * in dark mode (Tailwind `dark:` variants). SVGs live in /public.
 */
export function Logo({ className = 'h-7' }: { className?: string }) {
  return (
    <span className="inline-flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/supevo-logo-dark.svg"
        alt="supevo"
        className={`block w-auto dark:hidden ${className}`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/supevo-logo-white.svg"
        alt="supevo"
        className={`hidden w-auto dark:block ${className}`}
      />
    </span>
  );
}
