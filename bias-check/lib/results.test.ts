import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "./store.ts";
import { isResultId, loadResult, newResultId, saveResult } from "./results.ts";

const RESULT = {
  verdict: "FALSE" as const,
  summary: "No link was found.",
  segments: [{ text: "No link was found.", refs: [1] }],
  sources: [{ url: "https://who.int/a", title: "WHO", quote: "no link" }],
};

test("newResultId makes 16 lowercase alphanumeric characters, and they differ", () => {
  const a = newResultId();
  assert.match(a, /^[a-z0-9]{16}$/);
  assert.notEqual(a, newResultId());
});

test("isResultId accepts real ids and rejects anything malformed", () => {
  assert.ok(isResultId(newResultId()));
  for (const bad of ["", "short", "../../etc/passwd", "a".repeat(17), "ABCDEFGHIJKLMNOP", "abcd efgh ijkl mn"]) {
    assert.equal(isResultId(bad), false, `${JSON.stringify(bad)} should be rejected`);
  }
});

test("saveResult then loadResult returns the same claim and result", async () => {
  const store = memoryStore();
  const id = await saveResult("  Vaccines cause autism.  ", RESULT, store);
  assert.ok(isResultId(id));

  const saved = await loadResult(id, store);
  assert.equal(saved?.id, id);
  assert.equal(saved?.claim, "Vaccines cause autism.");
  assert.deepEqual(saved?.result, RESULT);
  assert.match(saved!.createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("saveResult stores under the result: key prefix", async () => {
  const store = memoryStore();
  const id = await saveResult("A claim.", RESULT, store);
  assert.ok(await store.get(`result:${id}`));
});

test("loadResult returns null for an unknown id and for a malformed one", async () => {
  const store = memoryStore();
  assert.equal(await loadResult("abcdefghijklmnop", store), null);
  assert.equal(await loadResult("../../../etc/passwd", store), null);
});
