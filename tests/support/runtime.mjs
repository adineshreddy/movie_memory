import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

export function startProcess(command, args, env) {
  const child = spawn(command, args, { env, stdio: "inherit" });
  const done = once(child, "exit");
  // A missing executable may fail before the caller awaits the process.
  void done.catch(() => {});
  return {
    done,
    async stop() {
      child.kill();
      await done;
    },
  };
}

export async function run(command, args, env) {
  const [code, signal] = await startProcess(command, args, env).done;
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} failed (${code ?? signal})`);
}

export async function waitFor(check, message, timeout = 5_000) {
  const end = Date.now() + timeout;
  do {
    if (await check()) return;
    await delay(25);
  } while (Date.now() < end);
  throw new Error(message);
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

export async function startApp(env) {
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  const url = `http://127.0.0.1:${port}`;
  const server = startProcess(process.execPath, [
    "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port),
  ], { ...env, AUTH_URL: url, NEXTAUTH_URL: url });

  try {
    await Promise.race([
      waitFor(async () => {
        const response = await fetch(url, { signal: AbortSignal.timeout(500) }).catch(() => null);
        if (!response) return false;
        await response.text();
        return response.ok;
      }, "Next.js test server did not become ready", 15_000),
      server.done.then(([code, signal]) => {
        throw new Error(`Next.js test server exited (${code ?? signal})`);
      }),
    ]);
    return { url, stop: server.stop };
  } catch (error) {
    await server.stop();
    throw error;
  }
}

export async function startFakeProvider() {
  const calls = [];
  const replies = new Map();
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404).end();
      return;
    }
    try {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const title = input.messages.find((message) => message.role === "user").content;
      calls.push(input);
      const reply = replies.get(title);
      response.setHeader("content-type", "application/json");
      if (reply) await reply(response);
      else sendFact(response, `Generated test fact for ${title}`);
    } catch {
      if (!response.headersSent) response.writeHead(400);
      response.end();
    }
  });
  const port = await listen(server);
  return {
    calls,
    replies,
    env: {
      FACT_MODE: "live",
      OPENAI_API_KEY: `test-key-${randomUUID()}`,
      OPENAI_MODEL: "test-model",
      OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
    },
    async stop() {
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    },
  };
}

export function sendFact(response, text) {
  response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: text } }] }));
}
