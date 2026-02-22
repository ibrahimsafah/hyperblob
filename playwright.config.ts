import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: {
      executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'],
    },
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
  },
});
