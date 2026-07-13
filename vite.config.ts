import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * Strip local dev-tool <script> injections from the built index.html.
 *
 * An external tool (the visual-editing timeline) writes a
 * `<!-- timeline-inject:start -->…:end -->` block pointing at
 * http://localhost:7331 directly into index.html on this machine, and it had
 * been committed and SHIPPED (c5ecb04). That is not merely a dead request:
 * `localhost` is a "potentially trustworthy" origin, so browsers do NOT block
 * it as mixed content on the production HTTPS page — anything listening on
 * that port on a visitor's machine gets to inject a module into the app.
 *
 * Deleting the block from index.html is not enough, because the tool rewrites
 * the file whenever it runs. The seam has to be the BUILD: strip it on the way
 * out and it can never ship again, no matter what re-injects it locally. Dev
 * is untouched (`apply: 'build'`), so the tool keeps working.
 */
function stripDevInjects(): Plugin {
  const INJECT_BLOCK = /[ \t]*<!--\s*timeline-inject:start\s*-->[\s\S]*?<!--\s*timeline-inject:end\s*-->[ \t]*\n?/g;
  return {
    name: 'seeko:strip-dev-injects',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const cleaned = html.replace(INJECT_BLOCK, '');
        if (cleaned !== html) {
          this.warn?.('stripped a dev-tool inject block from index.html');
        }
        // Backstop: never let a localhost script reach a production bundle,
        // even if the tool changes its marker comments.
        if (/<script[^>]+src=["']https?:\/\/(localhost|127\.0\.0\.1)/i.test(cleaned)) {
          throw new Error(
            'Refusing to build: index.html still references a localhost script. ' +
              'A dev tool injected a <script> that would ship to production.'
          );
        }
        return cleaned;
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_TARGET ?? 'http://localhost:8787';

  return {
    plugins: [react(), stripDevInjects()],
    // Shim for leftover Next.js client code that reads process.env.*.
    define: {
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      'process.env.NEXT_PUBLIC_APP_URL': JSON.stringify(env.NEXT_PUBLIC_APP_URL ?? ''),
      'process.env.NEXT_PUBLIC_SITE_URL': JSON.stringify(env.NEXT_PUBLIC_SITE_URL ?? ''),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/auth': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist/react-router',
      emptyOutDir: true,
      rollupOptions: {
        input: 'index.html',
        output: {
          /**
           * Split the framework out of the app chunk.
           *
           * The point is CACHE LIFETIME, not payload size: app code and React
           * shipped as one 497 KB chunk, so editing a button invalidated
           * React, the router and Supabase for every returning user. Framework
           * code changes on an npm upgrade; app code changes daily. Different
           * lifetimes belong in different files. This only pays off alongside
           * the immutable Cache-Control now set in src/api-server/index.ts —
           * hashed filenames are the mechanism, the header is the permission.
           *
           * TRAP: do NOT add a catch-all `if (id.includes('node_modules'))
           * return 'vendor'`. Rollup keeps a chunk lazy only while every
           * importer is lazy. A single catch-all merges the boot-graph deps
           * with the lazy-only ones (@react-pdf 405 KB, the chart stack), and
           * because the entry needs *part* of that chunk the WHOLE thing turns
           * eager — silently undoing the code-splitting that already works.
           * Name only what is genuinely on the boot path; return undefined for
           * everything else and let Rollup place it.
           */
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
              return 'vendor-react';
            }
            if (/[\\/]node_modules[\\/](react-router|@remix-run)/.test(id)) {
              return 'vendor-router';
            }
            if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) {
              return 'vendor-supabase';
            }
            return undefined;
          },
        },
      },
    },
  };
});
