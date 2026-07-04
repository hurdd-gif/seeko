import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { app } from './app';
import { loadLocalEnv } from './env';

loadLocalEnv();

const port = Number.parseInt(process.env.PORT ?? '8787', 10);
const hostname = process.env.HOST ?? '127.0.0.1';
const staticRoot = resolve(process.cwd(), 'dist/react-router');
const indexHtmlPath = resolve(staticRoot, 'index.html');
const server = new Hono().route('/', app);

if (existsSync(staticRoot) && existsSync(indexHtmlPath)) {
  const indexHtml = readFileSync(indexHtmlPath, 'utf8');
  // Serve ANY real file from the build output (hashed assets plus everything
  // Vite copies from public/ — logos, icons, manifest). serveStatic calls
  // next() on a miss, so unknown paths still fall through to the SPA HTML
  // below. A path whitelist here silently breaks new public/ files: they
  // 200 with index.html and render as broken images.
  server.use('*', serveStatic({ root: staticRoot }));
  server.get('*', (c) => {
    const pathname = new URL(c.req.url).pathname;
    if (pathname.startsWith('/api/') || pathname === '/api' || pathname.startsWith('/auth/')) {
      return c.notFound();
    }
    return c.html(indexHtml);
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
