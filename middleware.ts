import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { checkIpBanned, noteAbuseAndMaybeBan, rateLimitByIp } from "@/lib/rateLimit";

const ADMIN_PATH = process.env.NEXT_PUBLIC_ADMIN_PATH ?? "/02fec873a5d7a8960ed880f9";
const SUPER_ADMIN_PATH =
  process.env.NEXT_PUBLIC_SUPER_ADMIN_PATH ?? "/d3f1ca9b741ec069d8b4a5a1";
const API_PATH = process.env.NEXT_PUBLIC_API_PATH ?? "/61661349955feb4ef394a123";
const AUTH_PATH = `${API_PATH}/auth`;

function isProtectedPath(pathname: string) {
  return (
    pathname.startsWith(ADMIN_PATH) ||
    pathname.startsWith(SUPER_ADMIN_PATH) ||
    pathname.startsWith(API_PATH)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname) || pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  const banned = await checkIpBanned(ip);

  if (banned) {
    return NextResponse.json(
      {
        error: "Access denied for this IP address.",
        ip,
        reason: banned.reason,
        expiresAt: banned.expires_at,
      },
      { status: 403 },
    );
  }

  const limit = await rateLimitByIp(ip, pathname.startsWith(API_PATH) ? "61661349955feb4ef394a123" : "admin");

  if (!limit.success) {
    await noteAbuseAndMaybeBan(ip, "Repeated requests exceeded the configured threshold.");

    return NextResponse.json(
      {
        error: "Too many requests.",
        limit: limit.limit,
        remaining: limit.remaining,
        reset: limit.reset,
      },
      { status: 429 },
    );
  }

  if (pathname.startsWith(AUTH_PATH)) {
    return NextResponse.next();
  }

  if (pathname === ADMIN_PATH || pathname === SUPER_ADMIN_PATH) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    if (pathname.startsWith(API_PATH)) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    url.pathname = ADMIN_PATH;
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
