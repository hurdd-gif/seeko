import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/api/auth/callback');
  const isOnboardingRoute = pathname.startsWith('/onboarding');
  const isSetPasswordRoute = pathname.startsWith('/set-password');
  const isAgreementRoute = pathname.startsWith('/agreement') || pathname.startsWith('/api/agreement');
  const isPublicAsset =
    pathname.startsWith('/_next') || pathname.startsWith('/favicon');
  const isExternalSigningRoute = pathname.startsWith('/sign') || pathname.startsWith('/api/external-signing');

  if (!user && !isAuthRoute && !isPublicAsset && !isExternalSigningRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (user && !isSetPasswordRoute && !isAgreementRoute && !isPublicAsset && !isExternalSigningRoute) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarded, must_set_password, nda_accepted_at, is_admin')
      .eq('id', user.id)
      .single();

    if (profile?.must_set_password === true) {
      const url = request.nextUrl.clone();
      url.pathname = '/set-password';
      return NextResponse.redirect(url);
    }

    // NDA gate: non-admin users without a signed NDA get redirected (including from onboarding)
    if (!isAuthRoute && !isAgreementRoute && profile && !profile.nda_accepted_at && !profile.is_admin) {
      const url = request.nextUrl.clone();
      url.pathname = '/agreement';
      return NextResponse.redirect(url);
    }

    if (!isOnboardingRoute && !isAuthRoute && !isAgreementRoute && profile && profile.onboarded === 0) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      return NextResponse.redirect(url);
    }
  }

  // Security headers
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  supabaseResponse.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      `connect-src 'self' ${supabaseUrl} https://*.supabase.co wss://*.supabase.co`,
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' https://fonts.gstatic.com data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff');
  supabaseResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  supabaseResponse.headers.set('X-Frame-Options', 'DENY');

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff|woff2|otf|eot)$).*)',
  ],
};
