import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://clientpulse.app',
  trailingSlash: 'ignore',
  integrations: [
    react(),
    tailwind()
  ],
  output: 'hybrid',
  adapter: cloudflare({
    mode: 'directory',
    routes: {
      strategy: 'include',
      // Only dynamic routes need SSR - static pages like /clients/new are prerendered
      include: ['/clients/*/edit'],
      exclude: ['/api/*', '/clients/new']
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
