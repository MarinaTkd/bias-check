import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChoice } from "./matcher.ts";

test("parseChoice reads the chosen number, one-based", () => {
  assert.equal(parseChoice('{"match":1}', 3), 0);
  assert.equal(parseChoice('{"match": 3}', 3), 2);
});

test("parseChoice treats null, junk and out-of-range answers as no match", () => {
  for (const reply of ['{"match":null}', '{"match":0}', '{"match":4}', '{"match":"1"}', "NONE", "", "The new claim specifies"]) {
    assert.equal(parseChoice(reply, 3), null, `${JSON.stringify(reply)} should be no match`);
  }
});
