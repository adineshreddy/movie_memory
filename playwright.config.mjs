import { defineConfig } from "@playwright/test";

const baseURL = process.env.MOVIE_MEMORY_TEST_URL;
if (!baseURL) throw new Error("Run browser tests with npm run test:e2e");

export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
});
