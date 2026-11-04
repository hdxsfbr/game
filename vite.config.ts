import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';
import { dropPlugin } from './scripts/vite-drop';

// HTTPS in dev so getUserMedia works when the page is opened from another machine.
// The certificate is self-signed; accept the browser warning once.
export default defineConfig({
  base: './',
  plugins: [basicSsl(), dropPlugin()],
  server: { host: true, port: 5180, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
