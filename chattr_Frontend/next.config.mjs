/** @type {import('next').NextConfig} */

// The internal address of the .NET API. In dev the API listens on
// http://localhost:5147 (see Chattr.Api/Properties/launchSettings.json).
// In production this is whatever the reverse proxy / sidecar routes
// `/api/*` to — typically a unix socket or a private URL.
//
// This value is server-only: it is read by next.config.mjs at build
// time and never reaches the browser bundle. The browser only ever
// sees same-origin requests.
const INTERNAL_API_URL = process.env.INTERNAL_API_URL?.replace(/\/+$/, "")
  || "http://localhost:5147";

const nextConfig = {
  async rewrites() {
    return [
      // ---- API proxy ----------------------------------------------------
      // The browser talks to `/api/...` on the Next.js origin. Next.js
      // forwards the request to the .NET API server-side, then streams
      // the response back. The browser never makes a cross-origin call,
      // so no CORS preflight is ever needed.
      //
      // The Authorization, Content-Type, Accept, and request body are
      // all preserved by Next.js' built-in proxy. Only the Host header
      // is rewritten to match the destination.
      {
        source: "/api/:path*",
        destination: `${INTERNAL_API_URL}/api/:path*`,
      },

      // ---- Profile pages ------------------------------------------------
      // All four URL formats resolve to a single page. The browser URL
      // stays as the user typed it; the internal page lives at
      // /profile/<kind>/<value> where `kind` is "username" or "id".
      {
        source: "/u/:username",
        destination: "/profile/username/:username",
      },
      {
        source: "/user/:username",
        destination: "/profile/username/:username",
      },
      {
        source: "/i/:id",
        destination: "/profile/id/:id",
      },
      {
        source: "/id/:id",
        destination: "/profile/id/:id",
      },
    ];
  },
};

export default nextConfig;
