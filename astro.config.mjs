import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://privatefiletools.com',
  vite: {
    optimizeDeps: {
      include: ['heic2any'],
    },
  },
});
