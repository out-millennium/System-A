import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    // Use the same Webpack dev path as the validated frontend build. Next.js
    // 16 Turbopack currently fails to resolve next/font/google in this project.
    command: "npm run dev -- --webpack",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
