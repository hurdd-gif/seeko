import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['**/node_modules/**', '**/.claude/worktrees/**', '**/.worktrees/**', '**/dist/**', '**/.next/**'],
  },
  resolve: {
    alias: {
      // Keep test resolution identical to the migration build: original
      // components that import next/* resolve to the rr-app shims. Tests that
      // mock next/* via vi.mock() still take precedence over these aliases.
      'next/link': path.resolve(__dirname, './src/rr-app/shims/next-link.tsx'),
      'next/navigation': path.resolve(__dirname, './src/rr-app/shims/next-navigation.ts'),
      'next/image': path.resolve(__dirname, './src/rr-app/shims/next-image.tsx'),
      'next/dynamic': path.resolve(__dirname, './src/rr-app/shims/next-dynamic.tsx'),
      'next/cache': path.resolve(__dirname, './src/rr-app/shims/next-cache.ts'),
      'next/headers': path.resolve(__dirname, './src/rr-app/shims/next-headers.ts'),
      '@': path.resolve(__dirname, './src'),
    },
  },
});
