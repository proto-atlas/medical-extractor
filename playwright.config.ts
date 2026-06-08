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
    // 通常のE2E 10 シナリオ (auth / privacy / extract)。
    // screenshots.spec.tsは専用projectでだけ走らせるので明示的に除外する。
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
    // README用スクリーンショット取得専用project。
    // `npm run screenshots` で起動する。viewportはspec内でsetViewportSizeで
    // 切り替えるため、deviceはDesktop Chromeを流用する。
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
    // E2E専用のアクセスキーを注入する。.env.localの値には依存しない
    // （CIや他人のローカル環境でも同じ値でテストが動くように）。
    env: {
      ACCESS_PASSWORD: 'test-password-for-e2e',
    },
  },
});
