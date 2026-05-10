export type RpConfig = {
  rpId: string;
  rpName: string;
  origin: string;
};

export const RP_NAME = 'SEEKO Studio';

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
