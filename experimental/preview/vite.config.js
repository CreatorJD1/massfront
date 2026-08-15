import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  server: {
    host: '127.0.0.1',
    port: 5177,
    /* Do not spawn a new desktop browser on every `vite` run — reuse the
       tab already on 5177 (strictPort keeps the URL stable). */
    open: false,
    strictPort: true
  },
  build: {
    outDir: resolve(here, '../dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(here, 'preview.html')
    }
  }
});
