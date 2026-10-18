import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5180, strictPort: true },
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
