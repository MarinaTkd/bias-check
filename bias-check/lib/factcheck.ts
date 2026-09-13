import Anthropic from "@anthropic-ai/sdk";
import { TRUSTED_DOMAINS } from "./domains.ts";

export type Verdict = "FALSE" | "MOSTLY FALSE" | "MIXED" | "MOSTLY TRUE" | "TRUE" | "UNVERIFIABLE";
export type Source = { url: string; title: string; quote: string };
// A run of summary text plus the 1-based numbers of the sources that support it (empty = uncited).
export type Segment = { text: string; refs: number[] };
export type CheckResult = { verdict: Verdict; summary: string; segments: Segment[]; sources: Source[] };

const VERDICTS: Verdict[] = ["FALSE", "MOSTLY FALSE", "MIXED", "MOSTLY TRUE", "TRUE", "UNVERIFIABLE"];

export { TRUSTED_DOMAINS, TRUSTED_SOURCES } from "./domains.ts";

// bodyStart is the offset in `text` where the summary begins (just after the verdict line).
export function parseVerdict(text: string): { verdict: Verdict; summary: string; bodyStart: number } {
  const m = text.match(/^[\s*#>]*verdict:\s*([a-z][a-z ]*?)[*.!:\s]*(?:\r?\n|$)/im);
  if (!m || m.index === undefined) return { verdict: "UNVERIFIABLE", summary: text.trim(), bodyStart: 0 };
  const word = m[1].trim().toUpperCase().replace(/\s+/g, " ");
  const verdict = (VERDICTS as string[]).includes(word) ? (word as Verdict) : "UNVERIFIABLE";
  const bodyStart = m.index + m[0].length;
  return { verdict, summary: text.slice(bodyStart).trim(), bodyStart };
}

type CitationLike = { type: string; url?: string; title?: string | null; cited_text?: string };
type ContentLike = { type: string; text?: string; citations?: CitationLike[] | null };

// The API splits cited text into blocks and gives no separators, so two fixes on the seams:
// a text block after a tool block starts a new paragraph (so a verdict line after a preamble
// still starts a line), and a sentence that runs straight into the next block gets a space,
// while stray whitespace before punctuation is dropped.
export function withParagraphBreaks<T extends ContentLike>(blocks: T[]): T[] {
  let prev: string | null = null; // text of the previous block, null if it was not text
  let first = true;
  return blocks.map((b) => {
    if (b.type !== "text" || typeof b.text !== "string") {
      prev = null;
      return b;
    }
    let text = b.text;
    if (prev === null && !first) text = "\n" + text;
    else if (prev !== null) {
      if (/^\s+[,;:.!?]/.test(text)) text = text.replace(/^\s+/, "");
      else if (/[.!?]$/.test(prev) && /^[A-Za-z0-9"(]/.test(text)) text = " " + text;
    }
    prev = text;
    first = false;
    return text === b.text ? b : { ...b, text };
  });
}

// Splits the text blocks into segments carrying source numbers, dropping the first `skipChars`
// characters (the verdict line) and any whitespace-only leading/trailing segments.
export function buildSegments(blocks: ContentLike[], sources: Source[], skipChars: number): Segment[] {
  const numberByUrl = new Map(sources.map((s, i) => [s.url, i + 1]));
  const segments: Segment[] = [];
  let toSkip = skipChars;
  for (const b of blocks) {
    if (b.type !== "text" || typeof b.text !== "string") continue;
    let text = b.text;
    if (toSkip > 0) {
      const cut = Math.min(toSkip, text.length);
      text = text.slice(cut);
      toSkip -= cut;
    }
    if (!text) continue;
    const refs: number[] = [];
    for (const c of b.citations ?? []) {
      const n = c.url ? numberByUrl.get(c.url) : undefined;
      if (n && !refs.includes(n)) refs.push(n);
    }
    segments.push({ text, refs });
  }
  while (segments.length && !segments[0].text.trim() && !segments[0].refs.length) segments.shift();
  while (segments.length && !segments[segments.length - 1].text.trim() && !segments[segments.length - 1].refs.length) {
    segments.pop();
  }
  if (segments.length) {
    segments[0] = { ...segments[0], text: segments[0].text.replace(/^\s+/, "") };
    const last = segments.length - 1;
    segments[last] = { ...segments[last], text: segments[last].text.replace(/\s+$/, "") };
  }
  return segments;
}

export function extractSources(blocks: ContentLike[]): Source[] {
  const byUrl = new Map<string, Source>();
  for (const b of blocks) {
    if (b.type !== "text" || !b.citations) continue;
    for (const c of b.citations) {
      if (c.type !== "web_search_result_location" || !c.url || byUrl.has(c.url)) continue;
      byUrl.set(c.url, { url: c.url, title: c.title || c.url, quote: c.cited_text ?? "" });
    }
  }
  return [...byUrl.values()];
}

const SYSTEM_PROMPT = `You help people test their own beliefs against evidence. The user will state a claim they believe.

Research it with the web_search tool. Only the sources the tool returns are permitted; cite them.

Answer in this exact shape. Write nothing before the verdict line.
Line 1: "VERDICT: X" where X is exactly one of FALSE, MOSTLY FALSE, MIXED, MOSTLY TRUE, TRUE, UNVERIFIABLE.
Then a blank line, then at most 3 short paragraphs and at most 130 words in total.
Use no markdown anywhere in the reply, including the verdict line: no asterisks, bold, headings or bullets.

Every sentence must carry a specific fact from a source: a number, a sample size, a year, a named study, institution or dataset. Lead with the single strongest piece of evidence. Cut adjectives, hedging and general statements such as "research shows", "experts agree" or "overwhelmingly"; state the finding itself. Do not explain the history of the belief or how common it is unless that is the evidence. Do not restate the claim.

Focus on the strongest evidence AGAINST the claim, because the reader is checking their own bias. If the evidence clearly supports the claim, mark it TRUE and give the supporting data plainly; do not invent doubt. If the claim is opinion or cannot be checked, mark it UNVERIFIABLE and say in one sentence why. Never comment on the reader.`;

// Opus 5 at medium effort gave noticeably more specific, data-dense summaries than Sonnet 5 on
// test claims (~$0.14 vs ~$0.04 per new claim). Override with BIAS_CHECK_MODEL=claude-sonnet-5.
const MODEL = process.env.BIAS_CHECK_MODEL ?? "claude-opus-5";

// Throws Error("refused") if the model declined the request, or Error("incomplete") if
// research was still pausing/compacting after the continuation cap, hit max_tokens or the
// context window limit, or produced no text at all.
export async function checkClaim(claim: string): Promise<CheckResult> {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: claim }];
  const blocks: Anthropic.Beta.BetaContentBlock[] = [];
  let message!: Anthropic.Beta.BetaMessage;
  const startedAt = Date.now();
  console.log(`[bias-check] start claim=${JSON.stringify(claim.slice(0, 120))}`);

  // pause_turn/compaction: the server-side search loop hit its iteration cap or compacted
  // context; resend with the assistant turn appended and it resumes. Cap continuations so a
  // runaway can't loop forever. Content from every continuation is kept, not just the last.
  for (let attempt = 0; attempt < 4; attempt++) {
    const attemptStartedAt = Date.now();
    message = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages,
        // allowed_callers: ["direct"] keeps search out of the code-execution path, which both
        // drops citation payloads and roughly doubles input tokens.
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: 4,
            allowed_domains: TRUSTED_DOMAINS,
            allowed_callers: ["direct"],
          },
        ],
        output_config: { effort: "medium" },
      })
      .finalMessage();
    blocks.push(...message.content);
    logAttempt(attempt, message, Date.now() - attemptStartedAt);
    if (message.stop_reason !== "pause_turn" && message.stop_reason !== "compaction") break;
    messages.push({ role: "assistant", content: message.content });
  }

  if (message.stop_reason === "refusal") throw new Error("refused");
  if (
    message.stop_reason === "pause_turn" ||
    message.stop_reason === "compaction" ||
    message.stop_reason === "max_tokens" ||
    message.stop_reason === "model_context_window_exceeded"
  ) {
    throw new Error("incomplete");
  }

  const paragraphs = withParagraphBreaks(blocks);
  const text = paragraphs
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) throw new Error("incomplete");
  const { verdict, summary, bodyStart } = parseVerdict(text);
  const sources = extractSources(paragraphs);
  const segments = buildSegments(paragraphs, sources, bodyStart);
  console.log(
    `[bias-check] done verdict=${verdict} sources=${sources.length} citedSegments=${segments.filter((s) => s.refs.length).length}/${segments.length} summaryChars=${summary.length} total=${Date.now() - startedAt}ms`,
  );
  return { verdict, summary, segments, sources };
}

// One line per API round-trip: what the model searched, what came back, how it stopped, what it cost.
function logAttempt(attempt: number, message: Anthropic.Beta.BetaMessage, ms: number) {
  const queries: string[] = [];
  let results = 0;
  let searchErrors = 0;
  let textChars = 0;
  for (const b of message.content) {
    if (b.type === "server_tool_use" && b.name === "web_search") {
      queries.push(String((b.input as { query?: unknown })?.query ?? ""));
    } else if (b.type === "web_search_tool_result") {
      if (Array.isArray(b.content)) results += b.content.length;
      else searchErrors++;
    } else if (b.type === "text") {
      textChars += b.text.length;
    }
  }
  const u = message.usage;
  console.log(
    `[bias-check] attempt=${attempt} stop=${message.stop_reason} model=${message.model} searches=${queries.length} results=${results} searchErrors=${searchErrors} textChars=${textChars} in=${u.input_tokens} out=${u.output_tokens} ${ms}ms`,
  );
  for (const q of queries) console.log(`[bias-check]   search: ${q}`);
}
