import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  server: { port: 5173 },
  preview: { port: 4173 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
    coverage: { provider: 'v8', reporter: ['text'] },
  },
});
