// Browser test of the render panel against the real server and a real Blender (opt-in).
//   BLENDER_PATH=/Applications/Blender.app/Contents/MacOS/Blender npm run test:e2e:render
import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const data = mkdtempSync(join(tmpdir(), "studio-e2e-render-"));
export default defineConfig({
  testDir: "e2e-render",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "e2e-results",
  use: {
    baseURL: "http://127.0.0.1:4195",
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
  webServer: [
    {
      command: "node --experimental-strip-types server/index.ts",
      url: "http://127.0.0.1:8795/api/health",
      env: {
        STUDIO_PORT: "8795",
        STUDIO_DATA_DIR: data,
        STUDIO_EXTRA_ORIGINS: "http://127.0.0.1:4195",
        BLENDER_PATH: process.env.BLENDER_PATH ?? "",
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4195 --strictPort",
      url: "http://127.0.0.1:4195",
      env: { STUDIO_PORT: "8795" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
