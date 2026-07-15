import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { app } from './app';
import { loadLocalEnv } from './env';

loadLocalEnv();

const port = Number.parseInt(process.env.PORT ?? '8787', 10);
// Bind all interfaces by default so the container is reachable on its host —
// Render (and any container host) routes to the assigned PORT from outside the
// loopback, so a 127.0.0.1 bind reports as unreachable ("no-server"). Override
// with HOST if a narrower bind is ever needed locally.
const hostname = process.env.HOST ?? '0.0.0.0';
const staticRoot = resolve(process.cwd(), 'dist/react-router');
const indexHtmlPath = resolve(staticRoot, 'index.html');
const server = new Hono().route('/', app);

// Cache-Control is decided by ONE fact: can this URL's bytes ever change?
//
// - /assets/*  Vite content-hashes the filename, so the bytes behind a given
//              URL are immutable by construction. A rebuild emits a new hash.
// - /fonts/*   Not hashed by Vite (it is a public/ passthrough), but the name
//              encodes the exact cut — inter-latin-400-600.woff2. A different
//              font is a different filename, so the URL is content-addressed
//              by convention. It is also preloaded on the critical path, which
//              makes it the single worst thing to leave revalidating.
// - everything else must revalidate. index.html above all: it is the POINTER
//   to the hashed names, and caching it means a deploy serves stale pointers
//   to assets that no longer exist (the page then dies on a text/html-for-JS
//   MIME error). Other public/ files (icons, manifest) keep stable names
//   across deploys, so their bytes genuinely can change.
//
// This is load-bearing beyond the origin: Cloudflare fronts Render and only
// caches what the origin permits. With no header it marks every asset
// `cf-cache-status: DYNAMIC` and forwards the full payload to Node on every
// visit — the content hashing buys nothing at all.
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';
const isImmutablePath = (pathname: string) =>
  pathname.startsWith('/assets/') || pathname.startsWith('/fonts/');
const cacheControlFor = (pathname: string) =>
  isImmutablePath(pathname) ? IMMUTABLE : REVALIDATE;

if (existsSync(staticRoot) && existsSync(indexHtmlPath)) {
  // Serve ANY real file from the build output (hashed assets plus everything
  // Vite copies from public/ — logos, icons, manifest). serveStatic calls
  // next() on a miss, so unknown paths still fall through to the SPA HTML
  // below. A path whitelist here silently breaks new public/ files: they
  // 200 with index.html and render as broken images.
  server.use(
    '*',
    serveStatic({
      root: staticRoot,
      onFound: (path, c) => {
        c.header('Cache-Control', cacheControlFor(new URL(c.req.url).pathname));
      },
    })
  );
  server.get('*', (c) => {
    const pathname = new URL(c.req.url).pathname;
    if (pathname.startsWith('/api/') || pathname === '/api' || pathname.startsWith('/auth/')) {
      return c.notFound();
    }
    // Read per-request, never cache at boot: the HTML references hashed
    // asset filenames, so a rebuild while the server runs would otherwise
    // keep serving pointers to assets that no longer exist (the page then
    // dies on a text/html-for-JS MIME error).
    c.header('Cache-Control', REVALIDATE);
    return c.html(readFileSync(indexHtmlPath, 'utf8'));
  });
}

serve(
  {
    fetch: server.fetch,
    port,
    hostname,
  },
  (info) => {
    console.log(`SEEKO API listening on http://${hostname}:${info.port}`);
  }
);
