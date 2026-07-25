import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './webgl-next/e2e',
  testMatch: '**/*.pw.ts',
  outputDir: './test-results/webgl-next',
  preserveOutput: 'always',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium-swiftshader',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: {
        args: [
          '--enable-webgl',
          '--ignore-gpu-blocklist',
          '--use-angle=swiftshader',
        ],
      },
    },
  }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/webgl-next/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
