import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/' || pathname.startsWith('/api/auth/')) return;

  const session = req.cookies.get('staff_session');
  if (!session?.value) {
    return NextResponse.redirect(new URL('/', req.url));
  }
}

export const config = {
  matcher: ['/((?!_next|favicon|manifest\\.webmanifest|sw\\.js|icons/).*)'],
};
