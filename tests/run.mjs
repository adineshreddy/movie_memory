import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { run, startApp, startFakeProvider } from "./support/runtime.mjs";

const suite = process.argv[2];
if (!["backend", "browser"].includes(suite)) throw new Error("Choose backend or browser");

// The suite owns this Compose project. Never read the developer's DATABASE_URL.
const compose = ["compose", "-f", "tests/compose.yaml", "-p", `movie-memory-test-${randomUUID()}`];
try {
  await run("docker", [...compose, "up", "-d", "--wait"]);
  const binding = execFileSync("docker", [...compose, "port", "db", "5432"], { encoding: "utf8" }).trim();
  const port = /^127\.0\.0\.1:(\d+)$/.exec(binding)?.[1];
  if (!port) throw new Error("Expected a loopback port for the test database");
  const env = {
    ...process.env,
    // Prisma stores timezone-free timestamps as UTC. Keep pg fixtures in UTC too.
    TZ: "UTC",
    DATABASE_URL: `postgresql://movie_memory_test:movie_memory_test@127.0.0.1:${port}/movie_memory_test`,
    AUTH_SECRET: randomUUID(),
    AUTH_GOOGLE_ID: "test-client-id",
    AUTH_GOOGLE_SECRET: "test-client-secret",
    AUTH_TRUST_HOST: "true",
    AUTH_URL: "http://127.0.0.1",
    NEXTAUTH_URL: "http://127.0.0.1",
    FACT_MODE: "demo",
    OPENAI_API_KEY: "unused-test-key",
    OPENAI_MODEL: "test-model",
    OPENAI_BASE_URL: "http://127.0.0.1:1/v1",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  await run("npm", ["run", "db:migrate"], env);
  await run("npm", ["run", "build"], env);

  if (suite === "backend") {
    await run(process.execPath, ["--test", "--test-timeout=60000", "tests/backend/*.test.mjs"], env);
  } else {
    const provider = await startFakeProvider();
    try {
      const app = await startApp({ ...env, ...provider.env });
      try {
        await run(process.execPath, [
          "node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(3),
        ], { ...env, MOVIE_MEMORY_TEST_URL: app.url });
      } finally {
        await app.stop();
      }
    } finally {
      await provider.stop();
    }
  }
} finally {
  await run("docker", [...compose, "down", "-v"]);
}
