import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createViewer, openTestDatabase, saveFact, savedFacts, sessionCookie } from "../support/fixtures.mjs";
import { sendFact, startApp, startFakeProvider, waitFor } from "../support/runtime.mjs";

let db, provider, app;

before(async () => {
  db = openTestDatabase();
  provider = await startFakeProvider();
  app = await startApp({ ...process.env, ...provider.env });
});

after(async () => {
  await Promise.all([app?.stop(), provider?.stop(), db?.end()]);
});

function request(path, viewer, base = app.url) {
  return fetch(new URL(path, base), {
    headers: viewer ? { cookie: `${sessionCookie}=${viewer.token}` } : {},
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
}

async function dashboard(viewer, path = "/dashboard", base) {
  const response = await request(path, viewer, base);
  assert.equal(response.status, 200);
  return response.text();
}

function callsFor(title) {
  return provider.calls.filter(({ messages }) => messages.some(
    ({ role, content }) => role === "user" && content === title,
  ));
}

test("dashboard reuses the latest fresh fact without generating or inserting", async () => {
  const title = "Fresh cache movie";
  const viewer = await createViewer(db, { title });
  const older = await saveFact(db, viewer, "Older cached fact", { ageMs: 20_000 });
  const latest = await saveFact(db, viewer, "Latest cached fact");
  assert.match(await dashboard(viewer), /Latest cached fact/);
  assert.equal(callsFor(title).length, 0);
  assert.deepEqual(await savedFacts(db, viewer), [older, latest]);
});

for (const scenario of ["missing", "expired"]) {
  test(`dashboard generates once when the cache is ${scenario}`, async () => {
    const title = `Regeneration for ${scenario} cache`;
    const viewer = await createViewer(db, { title });
    const existing = scenario === "expired"
      ? [await saveFact(db, viewer, "Expired saved fact", { ageMs: 70_000 })]
      : [];
    const demo = await saveFact(db, viewer, "Fresh demo fact", { source: "DEMO" });
    const expected = `Generated test fact for ${title}`;
    assert.ok((await dashboard(viewer)).includes(expected));
    const rows = await savedFacts(db, viewer);
    assert.deepEqual(rows.slice(0, -1), [...existing, demo]);
    assert.equal(rows.at(-1).text, expected);
    assert.equal(rows.at(-1).source, "LIVE");
    assert.ok((await dashboard(viewer)).includes(expected));
    assert.equal(callsFor(title).length, 1);
    assert.deepEqual(await savedFacts(db, viewer), rows);
  });
}

test("the dashboard uses the session owner even when users choose the same movie", async () => {
  const title = "Shared movie title";
  const alice = await createViewer(db, { title });
  const bob = await createViewer(db, { title });
  await saveFact(db, alice, "Fact belonging to Alice");
  await saveFact(db, bob, "Fact belonging to Bob");

  for (const [viewer, other, ownFact, otherFact] of [
    [alice, bob, "Alice", "Bob"],
    [bob, alice, "Bob", "Alice"],
  ]) {
    const params = new URLSearchParams({ userId: other.id, movieId: other.movieId });
    const page = await dashboard(viewer, `/dashboard?${params}`);
    assert.ok(page.includes(`Fact belonging to ${ownFact}`));
    assert.ok(!page.includes(`Fact belonging to ${otherFact}`));
  }
  assert.equal(callsFor(title).length, 0);
});

test("protected routes redirect visitors with no valid session", async () => {
  const expired = await createViewer(db, { expired: true });
  for (const viewer of [undefined, { token: "unknown-session" }, expired]) {
    for (const route of ["/dashboard", "/onboarding"]) {
      const response = await request(route, viewer);
      assert.ok([303, 307, 308].includes(response.status));
      assert.equal(new URL(response.headers.get("location"), app.url).pathname, "/");
      await response.text();
    }
  }
});

test("overlapping requests across app instances share one generated fact", async () => {
  const title = "Concurrent refresh movie";
  const viewer = await createViewer(db, { title });
  const second = await startApp({ ...process.env, ...provider.env });
  const release = Promise.withResolvers();
  const requests = [];
  provider.replies.set(title, async (response) => {
    await release.promise;
    sendFact(response, "Fact shared by concurrent requests");
  });
  try {
    requests.push(dashboard(viewer));
    void requests[0].catch(() => {});
    await waitFor(() => callsFor(title).length > 0, "The first request never reached the provider");
    requests.push(dashboard(viewer), dashboard(viewer, "/dashboard", second.url));
    void Promise.all(requests).catch(() => {});
    // Confirm the requests really overlap before letting the provider return.
    await waitFor(async () => {
      const { rows } = await db.query(`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%FOR UPDATE%'`);
      return rows[0].waiting === 2;
    }, "Both refresh requests should wait for the row lock");
    release.resolve();
    for (const page of await Promise.all(requests)) {
      assert.match(page, /Fact shared by concurrent requests/);
    }
    assert.equal(callsFor(title).length, 1);
    assert.equal((await savedFacts(db, viewer)).length, 1);
  } finally {
    release.resolve();
    await Promise.allSettled(requests);
    provider.replies.delete(title);
    await second.stop();
  }
});

for (const [failure, reply] of [
  ["HTTP error", (response) => response.writeHead(503).end(JSON.stringify({ error: { message: "private-provider-detail" } }))],
  ["timeout", () => {}],
  ["unusable response", (response) => sendFact(response, "UNKNOWN")],
]) {
  test(`${failure}: serves the latest stale fact or a friendly message, then recovers`, async () => {
    const title = `Provider failure: ${failure}`;
    const withHistory = await createViewer(db, { title });
    const withoutHistory = await createViewer(db, { title });
    const older = await saveFact(db, withHistory, "Older saved fact", { ageMs: 100_000 });
    const latest = await saveFact(db, withHistory, "Latest saved fact", { ageMs: 70_000 });
    const demo = await saveFact(db, withoutHistory, "Demo fallback should never be used", { source: "DEMO" });
    provider.replies.set(title, reply);
    try {
      const [stalePage, emptyPage] = await Promise.all([dashboard(withHistory), dashboard(withoutHistory)]);
      assert.match(stalePage, /Latest saved fact/);
      assert.doesNotMatch(stalePage, /Older saved fact|private-provider-detail/);
      assert.match(emptyPage, /Please try again/);
      assert.doesNotMatch(emptyPage, /Latest saved fact|Demo fallback should never be used|private-provider-detail/);
      assert.equal(callsFor(title).length, 2);
      assert.deepEqual(await savedFacts(db, withHistory), [older, latest]);
      assert.deepEqual(await savedFacts(db, withoutHistory), [demo]);
    } finally {
      provider.replies.delete(title);
    }
    const expected = `Generated test fact for ${title}`;
    assert.ok((await dashboard(withHistory)).includes(expected));
    assert.ok((await dashboard(withHistory)).includes(expected));
    assert.equal(callsFor(title).length, 3);
    assert.equal((await savedFacts(db, withHistory)).at(-1).text, expected);
  });
}
