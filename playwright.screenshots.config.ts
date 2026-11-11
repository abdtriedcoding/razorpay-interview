import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'

/**
 * Browser walkthrough that verifies the main flows and saves screenshots to
 * docs/screenshots/ (used in PR descriptions). Run with `npm run screenshots`.
 * Kept out of the regular E2E run: files are named *.shot.ts, not *.spec.ts.
 */
export default defineConfig({
  ...baseConfig,
  testMatch: '**/*.shot.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
})
