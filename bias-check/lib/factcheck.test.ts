import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVerdict, extractSources, buildSegments, TRUSTED_DOMAINS } from "./factcheck.ts";

test("parseVerdict reads the verdict line and returns the rest as summary", () => {
  const r = parseVerdict("VERDICT: MOSTLY FALSE\n\nVaccines do not cause autism.\n\nSecond paragraph.");
  assert.equal(r.verdict, "MOSTLY FALSE");
  assert.equal(r.summary, "Vaccines do not cause autism.\n\nSecond paragraph.");
});

test("parseVerdict tolerates lowercase, extra spaces and no blank line", () => {
  const r = parseVerdict("  verdict:  true \nThe claim is correct.");
  assert.equal(r.verdict, "TRUE");
  assert.equal(r.summary, "The claim is correct.");
});

test("parseVerdict falls back to UNVERIFIABLE and keeps full text when line is missing", () => {
  const r = parseVerdict("I could not find anything.");
  assert.equal(r.verdict, "UNVERIFIABLE");
  assert.equal(r.summary, "I could not find anything.");
});

test("parseVerdict falls back to UNVERIFIABLE on an unknown verdict word", () => {
  const r = parseVerdict("VERDICT: PROBABLY\nBody.");
  assert.equal(r.verdict, "UNVERIFIABLE");
  assert.equal(r.summary, "Body.");
});

test("extractSources collects web search citations, de-duplicated by URL", () => {
  const blocks = [
    { type: "server_tool_use" },
    { type: "web_search_tool_result" },
    {
      type: "text",
      citations: [
        { type: "web_search_result_location", url: "https://www.cdc.gov/a", title: "CDC A", cited_text: "quote one" },
        { type: "web_search_result_location", url: "https://www.cdc.gov/a", title: "CDC A", cited_text: "quote dup" },
      ],
    },
    {
      type: "text",
      citations: [
        { type: "web_search_result_location", url: "https://who.int/b", title: null, cited_text: "quote two" },
        { type: "char_location", cited_text: "not a web citation" },
      ],
    },
    { type: "text", citations: null },
  ];
  assert.deepEqual(extractSources(blocks), [
    { url: "https://www.cdc.gov/a", title: "CDC A", quote: "quote one" },
    { url: "https://who.int/b", title: "https://who.int/b", quote: "quote two" },
  ]);
});

test("TRUSTED_DOMAINS is a non-empty list of bare hostnames within the API limit", () => {
  assert.ok(TRUSTED_DOMAINS.length > 0 && TRUSTED_DOMAINS.length <= 64);
  for (const d of TRUSTED_DOMAINS) {
    assert.match(d, /^[a-z0-9.-]+\.[a-z]+$/, `${d} should be a bare hostname`);
  }
  assert.equal(new Set(TRUSTED_DOMAINS).size, TRUSTED_DOMAINS.length, "no duplicates");
});

test("parseVerdict handles verdict with no trailing newline", () => {
  const r = parseVerdict("VERDICT: TRUE");
  assert.equal(r.verdict, "TRUE");
  assert.equal(r.summary, "");
});

test("parseVerdict handles verdict with trailing punctuation", () => {
  const r = parseVerdict("VERDICT: TRUE.\nBody.");
  assert.equal(r.verdict, "TRUE");
  assert.equal(r.summary, "Body.");
});

test("parseVerdict handles CRLF line endings", () => {
  const r = parseVerdict("VERDICT: MOSTLY FALSE\r\n\r\nBody.");
  assert.equal(r.verdict, "MOSTLY FALSE");
  assert.equal(r.summary, "Body.");
});

test("parseVerdict tolerates markdown bold around the verdict line", () => {
  const r = parseVerdict("**VERDICT: FALSE**\n\nBody.");
  assert.equal(r.verdict, "FALSE");
  assert.equal(r.summary, "Body.");
});

test("parseVerdict tolerates a markdown heading before the verdict line", () => {
  const r = parseVerdict("# Verdict: mixed\nBody.");
  assert.equal(r.verdict, "MIXED");
  assert.equal(r.summary, "Body.");
});

test("parseVerdict handles empty input", () => {
  const r = parseVerdict("");
  assert.equal(r.verdict, "UNVERIFIABLE");
  assert.equal(r.summary, "");
});

test("parseVerdict finds the verdict line after preamble text from a resumed turn", () => {
  const r = parseVerdict("Let me look into that.\n\nVERDICT: FALSE\nBody.");
  assert.equal(r.verdict, "FALSE");
  assert.equal(r.summary, "Body.");
});

test("parseVerdict does not match a paragraph that merely starts with the word Verdict", () => {
  const r = parseVerdict("Verdict aside, this is prose.\nMore.");
  assert.equal(r.verdict, "UNVERIFIABLE");
  assert.equal(r.summary, "Verdict aside, this is prose.\nMore.");
});

test("parseVerdict reports where the body starts", () => {
  const text = "Preamble.\nVERDICT: FALSE\n\nBody.";
  const r = parseVerdict(text);
  assert.equal(text.slice(r.bodyStart).trim(), "Body.");
  assert.equal(parseVerdict("No verdict here.").bodyStart, 0);
});

test("buildSegments attaches 1-based source numbers to each cited span and skips the verdict line", () => {
  const cdc = { type: "web_search_result_location", url: "https://cdc.gov/a", title: "CDC", cited_text: "q1" };
  const who = { type: "web_search_result_location", url: "https://who.int/b", title: "WHO", cited_text: "q2" };
  const blocks = [
    { type: "server_tool_use" },
    { type: "text", text: "VERDICT: FALSE\n\nFirst part. " },
    { type: "text", text: "Cited sentence one.", citations: [cdc] },
    { type: "text", text: " Plain middle. " },
    { type: "text", text: "Cited sentence two.", citations: [who, cdc, who] },
    { type: "text", text: "\n" },
  ];
  const sources = extractSources(blocks);
  const { bodyStart } = parseVerdict("VERDICT: FALSE\n\nFirst part. Cited sentence one. Plain middle. Cited sentence two.\n");
  assert.deepEqual(buildSegments(blocks, sources, bodyStart), [
    { text: "First part. ", refs: [] },
    { text: "Cited sentence one.", refs: [1] },
    { text: " Plain middle. ", refs: [] },
    { text: "Cited sentence two.", refs: [2, 1] },
  ]);
});
