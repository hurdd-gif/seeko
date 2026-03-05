import type { MetadataRoute } from 'next';

/**
 * PWA manifest so the app can be "Add to Home Screen" and run without
 * browser chrome (no top/bottom black bars). When opened from home screen
 * with display: standalone, all routes stay in scope and chrome stays hidden.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SEEKO Studio',
    short_name: 'SEEKO Studio',
    description: 'SEEKO Game Studio Platform',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#1a1a1a',
    theme_color: '#1a1a1a',
    icons: [
      { src: '/seeko-s.png', sizes: 'any', type: 'image/png', purpose: 'any' },
      { src: '/seeko-logo-white.png', sizes: 'any', type: 'image/png', purpose: 'any' },
    ],
  };
}
