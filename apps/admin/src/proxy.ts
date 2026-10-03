import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { hasClerkKeys, isDemoMode } from './lib/mode';
const isPublic = createRouteMatcher(['/sign-in(.*)', '/setup']);
const secured = clerkMiddleware(async (auth, request) => { if (!isPublic(request)) await auth.protect(); });
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isDemoMode()) return NextResponse.next();
  if (request.nextUrl.pathname === '/api/dispatch/tick') return NextResponse.next();
  if (!hasClerkKeys()) {
    if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 503 });
    return request.nextUrl.pathname === '/setup' ? NextResponse.next() : NextResponse.redirect(new URL('/setup', request.url));
  }
  return secured(request, event);
}
export const config = { matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'] };
