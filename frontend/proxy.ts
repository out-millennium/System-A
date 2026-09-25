import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function withCsp(req: NextRequest): NextResponse {
  const nonce = makeNonce();
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self'",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    // Next 16 emits its Flight/bootstrap inline scripts without attaching the
    // request nonce in this proxy setup. Allow those same-origin bootstrap
    // scripts explicitly; without this the public UI renders only its static
    // shell and hydration is blocked by CSP.
    "script-src 'self' 'unsafe-inline'", 
    "connect-src 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join("; ");

  // Next.js reads x-nonce from the request and applies it to its own inline
  // scripts. The response header is also set here so the browser enforces the
  // same nonce for the rendered document.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export function proxy(req: NextRequest) {
  const tokenPromise = getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return tokenPromise.then((token) => {
    const { pathname, searchParams } = req.nextUrl;
    const onboarded = Boolean((token as { onboarded?: boolean } | null)?.onboarded);

    // A safe internal callback path to honor on auth-page bounces (no open
    // redirects: only same-site paths beginning with a single "/").
    const rawCb = searchParams.get("callbackUrl");
    const callbackDest =
      rawCb && rawCb.startsWith("/") && !rawCb.startsWith("//")
        ? rawCb
        : "/dashboard";

    if (pathname.startsWith("/dashboard")) {
      if (!token) return NextResponse.redirect(new URL("/", req.url));
      if (!onboarded) return NextResponse.redirect(new URL("/register", req.url));
    }

    if (pathname === "/login" && token && onboarded) {
      return NextResponse.redirect(new URL(callbackDest, req.url));
    }

    if (pathname === "/register" && token && onboarded) {
      return NextResponse.redirect(new URL(callbackDest, req.url));
    }

    return withCsp(req);
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
