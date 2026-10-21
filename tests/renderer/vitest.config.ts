import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // The repo lives on a FUSE (bindfs) mount where loading jsdom can take longer
    // than vitest's fixed 60 s worker start timeout. vmForks starts the worker
    // first and loads the environment inside it, and one file at a time avoids
    // several workers competing for the slow disk.
    pool: 'vmForks',
    fileParallelism: false,
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/renderer/**/*.test.tsx', 'tests/renderer/**/*.test.ts']
  }
});
