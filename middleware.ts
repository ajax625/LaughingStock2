import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Set Security Headers
  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'origin-when-cross-origin');

  // Protect sensitive API routes
  if (pathname.startsWith('/api/portfolio/trade')) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid authentication session required' },
        { status: 401 }
      );
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/portfolio/trade', '/((?!_next/static|_next/image|favicon.ico).*)'],
};
