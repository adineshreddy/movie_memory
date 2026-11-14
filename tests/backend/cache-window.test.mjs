import assert from "node:assert/strict";
import { test } from "node:test";
import { isFactFresh } from "../../src/server/fact-cache.mts";

const now = Date.UTC(2026, 0, 1);

for (const [ageMs, fresh] of [[59_999, true], [60_000, false], [60_001, false]]) {
  test(`a fact aged ${ageMs} ms is ${fresh ? "fresh" : "expired"}`, () => {
    assert.equal(isFactFresh(new Date(now - ageMs), now), fresh);
  });
}
