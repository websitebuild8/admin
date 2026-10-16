import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from "next/server";
import { hasClerkKeys, isDemoMode } from "./lib/mode";
const isPublic = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/delivery/sign-in(.*)",
  "/join(.*)",
  "/partner/sign-in(.*)",
  "/partner/activate(.*)",
  "/driver/join(.*)",
  "/rider/join(.*)",
  "/rider/sign-in(.*)",
  "/rider/privacy",
  "/api/partner-applications",
  "/setup",
  "/legal(.*)",
]);
const secured = clerkMiddleware(async (auth, request) => {
  if (request.nextUrl.pathname.startsWith("/api/delivery/")) {
    const session = await auth();
    if (!session.userId)
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  } else if (!isPublic(request))
    await auth.protect({
      unauthenticatedUrl: new URL(
        request.nextUrl.pathname.startsWith("/rider")
          ? "/rider/sign-in"
          : request.nextUrl.pathname.startsWith("/partner")
            ? "/partner/sign-in"
            : "/delivery/sign-in",
        request.url,
      ).toString(),
    });
});
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const phaseOne =
    request.nextUrl.pathname.startsWith("/delivery") ||
    request.nextUrl.pathname.startsWith("/api/delivery/") ||
    request.nextUrl.pathname.startsWith("/join") ||
    request.nextUrl.pathname.startsWith("/partner") ||
    request.nextUrl.pathname.startsWith("/driver/join") ||
    request.nextUrl.pathname.startsWith("/rider") ||
    request.nextUrl.pathname === "/api/partner-applications" ||
    request.nextUrl.pathname === "/";
  if (isDemoMode() && !phaseOne) return NextResponse.next();
  // Native APIs authenticate bearer session tokens themselves and return JSON
  // errors; Clerk's page redirects must not intercept them or CORS preflights.
  if (request.nextUrl.pathname.startsWith("/api/mobile/"))
    return NextResponse.next();
  // A demo key grants access only to an isolated fictional DemoSession. It is
  // never accepted by real mobile or administrator APIs.
  if (request.nextUrl.pathname.startsWith("/api/demo/mobile/"))
    return NextResponse.next();
  if (
    [
      "/api/dispatch/tick",
      "/api/maintenance/menu-images",
      "/api/push/dispatch",
    ].includes(request.nextUrl.pathname)
  )
    return NextResponse.next();
  if (!hasClerkKeys()) {
    if (request.nextUrl.pathname === "/") return NextResponse.next();
    if (request.nextUrl.pathname.startsWith("/api/"))
      return NextResponse.json(
        { error: "Authentication is not configured." },
        { status: 503 },
      );
    return request.nextUrl.pathname === "/setup"
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/setup", request.url));
  }
  return secured(request, event);
}
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
