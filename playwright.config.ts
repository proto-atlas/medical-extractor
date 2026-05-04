import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // 通常の E2E 10 シナリオ (auth / privacy / extract)。
    // screenshots.spec.ts は専用 project でだけ走らせるので明示的に除外する。
    {
      name: 'chromium',
      testIgnore: ['**/screenshots.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: ['**/screenshots.spec.ts'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: ['**/screenshots.spec.ts'],
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      testIgnore: ['**/screenshots.spec.ts'],
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-safari',
      testIgnore: ['**/screenshots.spec.ts'],
      use: { ...devices['iPhone 15'] },
    },
    // README 用スクリーンショット取得専用 project。
    // `npm run screenshots` で起動する。viewport は spec 内で setViewportSize で
    // 切り替えるため、device は Desktop Chrome を流用する。
    {
      name: 'screenshots',
      testMatch: ['**/screenshots.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // E2E 専用のアクセスキーを注入する。.env.local の値には依存しない
    // （CI や他人のローカル環境でも同じ値でテストが動くように）。
    env: {
      ACCESS_PASSWORD: 'test-password-for-e2e',
    },
  },
});
