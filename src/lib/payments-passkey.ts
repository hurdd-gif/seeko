import { SignJWT } from 'jose';

export type RpConfig = {
  rpId: string;
  rpName: string;
  origin: string;
};

export const RP_NAME = 'SEEKO Studio';
export const PAYMENTS_COOKIE = 'payments-token';
export const PAYMENTS_COOKIE_MAX_AGE = 60 * 60;

export type IssuedCookie = {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'strict';
    path: string;
    maxAge: number;
  };
};

export async function issuePaymentsCookie(userId: string): Promise<IssuedCookie> {
  const secret = process.env.PAYMENTS_JWT_SECRET;
  if (!secret) throw new Error('PAYMENTS_JWT_SECRET is not configured');

  const token = await new SignJWT({ sub: userId, scope: 'payments' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${PAYMENTS_COOKIE_MAX_AGE}s`)
    .setIssuedAt()
    .sign(new TextEncoder().encode(secret));

  return {
    name: PAYMENTS_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/payments',
      maxAge: PAYMENTS_COOKIE_MAX_AGE,
    },
  };
}

export function getRpConfig(origin: string): RpConfig {
  const url = new URL(origin);
  return {
    rpId: url.hostname,
    rpName: RP_NAME,
    origin: url.origin,
  };
}

export function deriveDeviceName(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone')) return 'iPhone';
  if (ua.includes('ipad')) return 'iPad';
  if (ua.includes('mac os')) return 'Mac';
  if (ua.includes('android')) return 'Android device';
  if (ua.includes('windows')) return 'Windows device';
  if (ua.includes('linux')) return 'Linux device';
  return 'Unknown device';
}
