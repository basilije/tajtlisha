import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // The repo lives on a FUSE (bindfs) mount; parallel workers each loading jsdom
    // time out waiting for the worker to start. One worker at a time is faster here.
    fileParallelism: false,
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/renderer/**/*.test.tsx']
  }
});
