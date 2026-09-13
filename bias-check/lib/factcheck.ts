import Anthropic from "@anthropic-ai/sdk";

export type Verdict = "FALSE" | "MOSTLY FALSE" | "MIXED" | "MOSTLY TRUE" | "TRUE" | "UNVERIFIABLE";
export type Source = { url: string; title: string; quote: string };
export type CheckResult = { verdict: Verdict; summary: string; sources: Source[] };

const VERDICTS: Verdict[] = ["FALSE", "MOSTLY FALSE", "MIXED", "MOSTLY TRUE", "TRUE", "UNVERIFIABLE"];

// Edit this list to change what counts as trustworthy. Subdomains are covered automatically.
export const TRUSTED_DOMAINS: string[] = [
  // Health & science agencies
  "who.int", "cdc.gov", "nih.gov", "fda.gov", "ecdc.europa.eu", "nhs.uk",
  "nasa.gov", "noaa.gov", "epa.gov", "usgs.gov", "ipcc.ch", "esa.int",
  // Peer-reviewed publishers & indexes
  "nature.com", "science.org", "thelancet.com", "nejm.org", "bmj.com", "jamanetwork.com",
  "cochranelibrary.com", "plos.org", "sciencedirect.com", "springer.com", "wiley.com",
  "cell.com", "pnas.org", "arxiv.org", "ncbi.nlm.nih.gov",
  // Statistics & international bodies
  "un.org", "worldbank.org", "imf.org", "oecd.org", "ourworldindata.org",
  "census.gov", "bls.gov", "ons.gov.uk", "eurostat.ec.europa.eu", "europa.eu",
  // Reference & research institutions
  "britannica.com", "pewresearch.org", "rand.org", "brookings.edu",
  // Fact-checkers
  "snopes.com", "factcheck.org", "politifact.com", "fullfact.org",
];

export function parseVerdict(text: string): { verdict: Verdict; summary: string } {
  const m = text.match(/^[\s*#>]*verdict:\s*([a-z][a-z ]*?)[*.!:\s]*(?:\r?\n|$)/im);
  if (!m || m.index === undefined) return { verdict: "UNVERIFIABLE", summary: text.trim() };
  const word = m[1].trim().toUpperCase().replace(/\s+/g, " ");
  const verdict = (VERDICTS as string[]).includes(word) ? (word as Verdict) : "UNVERIFIABLE";
  return { verdict, summary: text.slice(m.index + m[0].length).trim() };
}

type CitationLike = { type: string; url?: string; title?: string | null; cited_text?: string };
type ContentLike = { type: string; citations?: CitationLike[] | null };

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

Then answer in this exact shape:
Line 1: "VERDICT: X" where X is exactly one of FALSE, MOSTLY FALSE, MIXED, MOSTLY TRUE, TRUE, UNVERIFIABLE.
Then a blank line, then 2 to 5 short paragraphs of plain prose.
Use no markdown anywhere in the reply, including the verdict line: no asterisks, bold, headings or bullets.

Focus the summary on the strongest evidence AGAINST the claim, because the reader is checking their own bias. If the evidence clearly supports the claim, say so plainly and mark it TRUE; do not invent doubt. If the claim is a matter of opinion or cannot be checked, mark it UNVERIFIABLE and explain why. Be direct, specific and non-judgemental about the reader.`;

// Throws Error("refused") if the model declined the request, or Error("incomplete") if
// research was still pausing/compacting after the continuation cap, hit max_tokens or the
// context window limit, or produced no text at all.
export async function checkClaim(claim: string): Promise<CheckResult> {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: claim }];
  const blocks: Anthropic.Beta.BetaContentBlock[] = [];
  let message!: Anthropic.Beta.BetaMessage;

  // pause_turn/compaction: the server-side search loop hit its iteration cap or compacted
  // context; resend with the assistant turn appended and it resumes. Cap continuations so a
  // runaway can't loop forever. Content from every continuation is kept, not just the last.
  for (let attempt = 0; attempt < 4; attempt++) {
    message = await client.beta.messages
      .stream({
        model: "claude-opus-5",
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages,
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 8, allowed_domains: TRUSTED_DOMAINS },
        ],
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      })
      .finalMessage();
    blocks.push(...message.content);
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

  const text = blocks
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) throw new Error("incomplete");
  const { verdict, summary } = parseVerdict(text);
  return { verdict, summary, sources: extractSources(blocks) };
}
