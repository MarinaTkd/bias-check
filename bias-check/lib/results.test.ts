import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("isResultId accepts real ids and rejects anything that could escape the directory", () => {
  assert.ok(isResultId(newResultId()));
  for (const bad of ["", "short", "../../etc/passwd", "a".repeat(17), "ABCDEFGHIJKLMNOP", "abcd efgh ijkl mn", "abcdefghijklmno/"]) {
    assert.equal(isResultId(bad), false, `${JSON.stringify(bad)} should be rejected`);
  }
});

test("saveResult then loadResult returns the same claim and result", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bias-check-"));
  const id = await saveResult("  Vaccines cause autism.  ", RESULT, dir);
  assert.ok(isResultId(id));

  const saved = await loadResult(id, dir);
  assert.equal(saved?.id, id);
  assert.equal(saved?.claim, "Vaccines cause autism.");
  assert.deepEqual(saved?.result, RESULT);
  assert.match(saved!.createdAt, /^\d{4}-\d{2}-\d{2}T/);

  const onDisk = JSON.parse(await readFile(join(dir, `${id}.json`), "utf8"));
  assert.equal(onDisk.claim, "Vaccines cause autism.");
});

test("loadResult returns null for an unknown id and never reads outside the directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bias-check-"));
  assert.equal(await loadResult("abcdefghijklmnop", dir), null);
  assert.equal(await loadResult("../../../etc/passwd", dir), null);
});
