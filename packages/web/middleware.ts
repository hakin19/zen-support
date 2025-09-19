import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';

import type { NextRequest } from 'next/server';

const PROTECTED_PATHS = [
  '/chat',
  '/settings',
  '/dashboard',
  '/devices',
  '/sessions',
  '/users',
];

const PUBLIC_PATHS = ['/', '/login', '/signup'];
const AUTH_PATH_PREFIX = '/auth';

const isProtectedPath = (pathname: string): boolean =>
  PROTECTED_PATHS.some(
    path => pathname === path || pathname.startsWith(`${path}/`)
  );

const isAuthPath = (pathname: string): boolean =>
  pathname === '/login' || pathname === '/signup';

const isPublicPath = (pathname: string): boolean => {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return (
    pathname === AUTH_PATH_PREFIX || pathname.startsWith(`${AUTH_PATH_PREFIX}/`)
  );
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (!isPublicPath(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({
          name,
          value,
          ...options,
        });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({
          name,
          value,
          ...options,
        });
      },
      remove(name: string) {
        request.cookies.delete(name);
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.delete(name);
      },
    },
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (isProtectedPath(request.nextUrl.pathname) && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (session && isAuthPath(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/chat', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public|api).*)'],
};
