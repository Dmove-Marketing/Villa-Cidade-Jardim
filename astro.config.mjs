import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  redirects: {
    '/': '/bio',
  },
  prefetch: true,
  build: {
    inlineStylesheets: 'auto',
  },
  server: {
    port: 4321,
  },
});
