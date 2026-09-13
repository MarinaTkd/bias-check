import { test } from "node:test";
import assert from "node:assert/strict";
import { numbersOf, shortlist, similarity, tokenise } from "./similar.ts";

test("tokenise drops filler words, punctuation and plural endings", () => {
  assert.deepEqual(tokenise("Do vaccines cause autism?"), ["vaccine", "cause", "autism"]);
  assert.deepEqual(tokenise("Vaccines cause autism."), ["vaccine", "cause", "autism"]);
  assert.deepEqual(tokenise("Studies show it"), ["study", "show"]);
});

test("tokenise keeps negation, because it flips the meaning", () => {
  assert.ok(tokenise("vaccines do not cause autism").includes("not"));
  assert.ok(tokenise("sugar never causes hyperactivity").includes("never"));
  assert.ok(tokenise("you cannot catch a cold from cold air").includes("not"));
});

test("tokenise normalises numbers so 10% and ten percent agree", () => {
  assert.deepEqual(tokenise("humans use 10% of their brains"), tokenise("humans use ten percent of their brain"));
});

test("similarity is 1 for the same tokens and 0 for nothing in common", () => {
  assert.equal(similarity(["a", "b"], ["a", "b"]), 1);
  assert.equal(similarity(["a", "b"], ["c", "d"]), 0);
  assert.equal(similarity([], []), 0);
});

test("shortlist finds rephrasings and ignores unrelated claims", () => {
  const entries = [
    { claim: "Vaccines cause autism.", key: "cache:v" },
    { claim: "The Great Wall is visible from space.", key: "cache:w" },
    { claim: "Humans only use 10% of their brains.", key: "cache:b" },
  ];
  const picked = shortlist("Do vaccines cause autism in children?", entries);
  assert.equal(picked[0]?.key, "cache:v");
  assert.ok(!picked.some((e) => e.key === "cache:w"));
});

test("shortlist returns at most the requested number, best first", () => {
  const suffixes = ["really", "badly", "slightly", "permanently", "always", "somewhat", "mildly", "greatly", "quickly", "surely"];
  const entries = suffixes.map((word, i) => ({ claim: `Coffee stunts growth ${word}`, key: `k${i}` }));
  assert.equal(shortlist("Does coffee stunt growth?", entries, 3).length, 3);
});

test("shortlist offers an opposite claim as a candidate rather than deciding itself", () => {
  // Negation barely changes the wording, so the cheap pass cannot be trusted to rule it out.
  // It must surface the candidate and leave the judgement to the model.
  const entries = [{ claim: "Vaccines do not cause autism.", key: "cache:n" }];
  assert.equal(shortlist("Vaccines cause autism.", entries).length, 1);
});

test("numbersOf pulls out the quantities, treating 10% and ten percent alike", () => {
  assert.deepEqual(numbersOf("humans use 10% of their brains"), ["10"]);
  assert.deepEqual(numbersOf("humans use ten percent of their brain"), ["10"]);
  assert.deepEqual(numbersOf("no numbers here"), []);
});

test("shortlist refuses a candidate whose quantities differ, whatever the wording", () => {
  // The model has been observed matching these two; a different number is a different claim,
  // so the candidate never reaches it.
  const entries = [{ claim: "Humans only use 10% of their brains.", key: "cache:b" }];
  assert.deepEqual(shortlist("Humans use 90% of their brains.", entries), []);
  assert.equal(shortlist("we only use ten percent of our brain", entries).length, 1);
});
