import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "./store.ts";
import { lookup, remember } from "./cache.ts";
import type { Matcher } from "./matcher.ts";

const RESPONSE = {
  id: "aaaaaaaaaaaaaaaa",
  verdict: "FALSE" as const,
  summary: "No.",
  segments: [{ text: "No.", refs: [] }],
  sources: [],
};

const neverMatches: Matcher = async () => null;
const alwaysFirst: Matcher = async (_claim, candidates) => candidates[0] ?? null;

test("an exact repeat hits without consulting the model", async () => {
  const store = memoryStore();
  await remember("Vaccines cause autism.", RESPONSE, store);
  let asked = false;
  const spy: Matcher = async () => {
    asked = true;
    return null;
  };
  const hit = await lookup("vaccines cause autism", store, spy);
  assert.equal(hit?.response.id, RESPONSE.id);
  assert.equal(hit?.matchedClaim, undefined, "an exact hit is not a reuse of a different claim");
  assert.equal(asked, false, "the model must not be paid for an exact match");
});

test("a rephrasing hits and reports the claim it reused", async () => {
  const store = memoryStore();
  await remember("Vaccines cause autism.", RESPONSE, store);
  const hit = await lookup("Do vaccines cause autism in children?", store, alwaysFirst);
  assert.equal(hit?.response.id, RESPONSE.id);
  assert.equal(hit?.matchedClaim, "Vaccines cause autism.");
});

test("the model's refusal to match means a miss", async () => {
  const store = memoryStore();
  await remember("Vaccines cause autism.", RESPONSE, store);
  assert.equal(await lookup("Do vaccines cause autism?", store, neverMatches), null);
});

test("an unrelated claim never reaches the model", async () => {
  const store = memoryStore();
  await remember("Vaccines cause autism.", RESPONSE, store);
  let asked = false;
  const spy: Matcher = async () => {
    asked = true;
    return null;
  };
  assert.equal(await lookup("The Great Wall is visible from space.", store, spy), null);
  assert.equal(asked, false, "nothing was similar enough to be worth asking about");
});

test("an index entry whose cached answer has expired is skipped, not served", async () => {
  const store = memoryStore();
  await remember("Vaccines cause autism.", RESPONSE, store, 0); // already expired
  assert.equal(await lookup("Do vaccines cause autism?", store, alwaysFirst), null);
});

test("the index keeps the most recent claims and stays bounded", async () => {
  const store = memoryStore();
  for (let i = 0; i < 320; i++) await remember(`Claim number ${i} about sleep.`, RESPONSE, store);
  const index = await store.get<unknown[]>("cache:index");
  assert.ok(index!.length <= 300, `index grew to ${index!.length}`);
  const hit = await lookup("Claim number 319 about sleep.", store, neverMatches);
  assert.ok(hit, "the newest claim is still cached");
});
