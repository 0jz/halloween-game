import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  retries: 0,
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
});
