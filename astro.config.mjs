import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://clientpulse.app',
  integrations: [
    react(),
    tailwind()
  ],
  output: 'hybrid',
  adapter: cloudflare({
    mode: 'directory',
    routes: {
      strategy: 'include',
      include: ['/clients/*', '/clients/*/edit'],
      exclude: ['/api/*']
    }
  }),
  build: {
    assets: 'assets'
  },
  vite: {
    optimizeDeps: {
      exclude: ['@cloudflare/workers-types']
    }
  }
});
