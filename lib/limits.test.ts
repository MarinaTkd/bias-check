import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "./store.ts";
import { checkAllowed } from "./limits.ts";

const NOW = new Date("2026-10-05T12:00:00Z");

test("a person gets three checks a day, then is refused", async () => {
  const store = memoryStore();
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(await checkAllowed("1.1.1.1", store, NOW), { ok: true }, `check ${i + 1} should pass`);
  }
  assert.deepEqual(await checkAllowed("1.1.1.1", store, NOW), { ok: false, reason: "ip" });
});

test("one person's limit does not affect another's", async () => {
  const store = memoryStore();
  for (let i = 0; i < 3; i++) await checkAllowed("1.1.1.1", store, NOW);
  assert.deepEqual(await checkAllowed("2.2.2.2", store, NOW), { ok: true });
});

test("the daily limit resets the next day", async () => {
  const store = memoryStore();
  for (let i = 0; i < 3; i++) await checkAllowed("1.1.1.1", store, NOW);
  const tomorrow = new Date("2026-10-06T12:00:00Z");
  assert.deepEqual(await checkAllowed("1.1.1.1", store, tomorrow), { ok: true });
});

test("everyone together is capped per day", async () => {
  const store = memoryStore();
  // 12 a day globally, taken three at a time by four different people
  for (const ip of ["a", "b", "c", "d"]) {
    for (let i = 0; i < 3; i++) {
      assert.deepEqual(await checkAllowed(ip, store, NOW), { ok: true }, `${ip} ${i}`);
    }
  }
  assert.deepEqual(await checkAllowed("e", store, NOW), { ok: false, reason: "global" });
});

test("the monthly budget refuses even on a fresh day", async () => {
  const store = memoryStore();
  await store.set("budget:2026-10", 140);
  assert.deepEqual(await checkAllowed("9.9.9.9", store, NOW), { ok: false, reason: "budget" });
});

test("an allowed check adds to the month's budget", async () => {
  const store = memoryStore();
  await checkAllowed("3.3.3.3", store, NOW);
  await checkAllowed("3.3.3.3", store, NOW);
  assert.equal(await store.get("budget:2026-10"), 2);
});

test("a refused check does not add to the month's budget", async () => {
  const store = memoryStore();
  for (let i = 0; i < 4; i++) await checkAllowed("4.4.4.4", store, NOW); // the fourth is refused
  assert.equal(await store.get("budget:2026-10"), 3);
});
