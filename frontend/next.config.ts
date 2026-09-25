import type { NextConfig } from "next";

// Security headers applied by Next itself. nginx sets these too in production,
// but having them at the app layer protects any path that reaches Next directly
// (e.g. a misconfigured proxy or the internal port). CSP is intentionally left
// to nginx (it needs per-deployment origins); here we ship the framework-safe
// headers that never break the app.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // don't advertise the framework/version
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
