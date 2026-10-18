import { defineConfig } from "@playwright/test";
// Uses the system Chrome (no browser download). Headless Chrome renders WebGL via SwiftShader.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "e2e-results",
  use: {
    baseURL: "http://127.0.0.1:4180",
    channel: "chrome",
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
      ],
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4180 --strictPort",
    url: "http://127.0.0.1:4180",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
