import { test } from "node:test";
import assert from "node:assert/strict";
import { getStore, memoryStore } from "./store.ts";

test("set then get round-trips an object, and a missing key is null", async () => {
  const s = memoryStore();
  await s.set("a", { n: 1, deep: { ok: true } });
  assert.deepEqual(await s.get("a"), { n: 1, deep: { ok: true } });
  assert.equal(await s.get("missing"), null);
});

test("a value with a zero-second ttl is already gone", async () => {
  const s = memoryStore();
  await s.set("a", "x", 0);
  assert.equal(await s.get("a"), null);
});

test("incr counts up from nothing and keeps counting", async () => {
  const s = memoryStore();
  assert.equal(await s.incr("c", 60), 1);
  assert.equal(await s.incr("c", 60), 2);
  assert.equal(await s.incr("c", 60), 3);
});

test("incr does not give an existing untimed key an expiry", async () => {
  const s = memoryStore();
  await s.set("b", 5);
  assert.equal(await s.incr("b", 0), 6);
  assert.equal(await s.get("b"), 6); // a 0s ttl must not have been applied to it
});

test("push then list returns everything pushed, oldest first", async () => {
  const s = memoryStore();
  await s.push("l", { a: 1 });
  await s.push("l", { a: 2 });
  assert.deepEqual(await s.list("l"), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(await s.list("empty"), []);
});

test("getStore falls back to memory when Redis credentials are absent", async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const s = getStore();
  await s.set("k", "v");
  assert.equal(await s.get("k"), "v");
});
