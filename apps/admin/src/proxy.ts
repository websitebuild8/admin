import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { hasClerkKeys, isDemoMode } from './lib/mode';
const isPublic = createRouteMatcher(['/sign-in(.*)', '/setup','/legal(.*)']);
const secured = clerkMiddleware(async (auth, request) => { if (!isPublic(request)) await auth.protect(); });
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isDemoMode()) return NextResponse.next();
  // Native APIs authenticate bearer session tokens themselves and return JSON
  // errors; Clerk's page redirects must not intercept them or CORS preflights.
  if (request.nextUrl.pathname.startsWith('/api/mobile/')) return NextResponse.next();
  // A demo key grants access only to an isolated fictional DemoSession. It is
  // never accepted by real mobile or administrator APIs.
  if (request.nextUrl.pathname.startsWith('/api/demo/mobile/')) return NextResponse.next();
  if (['/api/dispatch/tick','/api/maintenance/menu-images'].includes(request.nextUrl.pathname)) return NextResponse.next();
  if (!hasClerkKeys()) {
    if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 503 });
    return request.nextUrl.pathname === '/setup' ? NextResponse.next() : NextResponse.redirect(new URL('/setup', request.url));
  }
  return secured(request, event);
}
export const config = { matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'] };
