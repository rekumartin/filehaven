import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://filehaven.com',
  base: process.env.BASE_PATH || '/',
  vite: {
    optimizeDeps: {
      include: ['heic2any'],
    },
  },
});
