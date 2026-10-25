import { defineConfig } from "@playwright/test";

const mobileUse = {
  browserName: "chromium" as const,
  channel: "chrome" as const,
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
};

// These are Chromium viewport/touch/UA simulations, not Android or iOS emulators.
// They cannot certify Safari/WebKit behavior, 2 GB memory pressure, storage eviction,
// or installed-PWA persistence; those require Android Studio/Xcode and real devices.
const explicitBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  use: {
    baseURL: explicitBaseUrl ?? "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "RCO-Android10-2GB-viewport", use: { ...mobileUse, viewport: { width: 360, height: 800 }, userAgent: "Mozilla/5.0 (Linux; Android 10; Nokia 2.4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36" } },
    { name: "RCO-Android11-Go-viewport", use: { ...mobileUse, viewport: { width: 360, height: 720 }, userAgent: "Mozilla/5.0 (Linux; Android 11; Nokia C21 Plus) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36" } },
    { name: "RCO-Android12-3GB-viewport", use: { ...mobileUse, viewport: { width: 360, height: 800 }, userAgent: "Mozilla/5.0 (Linux; Android 12; moto e22) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36" } },
    { name: "RCO-iPhone8-viewport", use: { ...mobileUse, viewport: { width: 375, height: 667 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 Version/16.4 Mobile/15E148 Safari/604.1" } },
    { name: "RCO-iPhoneSE2-viewport", use: { ...mobileUse, viewport: { width: 375, height: 667 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 Version/16.4 Mobile/15E148 Safari/604.1" } },
  ],
  webServer: explicitBaseUrl ? undefined : {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
