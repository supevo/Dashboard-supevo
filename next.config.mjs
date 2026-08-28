/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Produces a self-contained server bundle for a small production container.
  output: 'standalone',
  // sharp has a native binary – keep it external so it isn't bundled and is
  // copied into the standalone output as-is (used for on-the-fly cover resizing).
  serverExternalPackages: ['sharp'],
  // Security headers applied to every response. A stricter CSP with nonces
  // is added once the streaming/script strategy is finalized (see docs/05).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // SAMEORIGIN (not DENY) so our own pages can embed same-origin
          // resources such as the inline PDF preview; other sites still can't
          // frame us (clickjacking protection preserved).
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
