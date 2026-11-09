import { defineConfig } from '@playwright/test';

// macOS-only checks on the real desktop (see tests/mac). Run through `npm run test:report`.
export default defineConfig({
  testDir: 'tests/mac',
  timeout: 60_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
});
