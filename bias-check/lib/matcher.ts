import Anthropic from "@anthropic-ai/sdk";
import type { CacheEntry } from "./similar.ts";

// Decides whether a new claim is really asking the same thing as one already answered. The cheap
// token overlap in `similar.ts` cannot do this: negation and changed quantities barely move a
// string-similarity score but reverse the answer. A Haiku call costs about $0.0003 against the
// $0.14 a full re-check would cost, so it is worth spending on every miss.
const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You decide whether a new claim asks exactly the same thing as one already answered.

Reply with the number of the matching claim, or null when none of them matches.

Answer with a number only if an answer to the numbered claim would be a complete and correct answer to the new claim. In particular:
- A claim and its negation are NOT a match. "X causes Y" and "X does not cause Y" are opposites.
- Different quantities, groups, places or time periods are NOT a match.
- A weaker and a stronger version of a claim are NOT a match. "X can cause Y" and "X always causes Y" differ.
- Different wording, grammar, spelling or question form IS a match when the substance is identical.

When in doubt, answer null.`;

// Turns the model's JSON reply into a candidate index, or null. Anything unexpected is a null,
// because a wrong reuse shows the reader the wrong answer while a miss only costs money.
// Exported for testing.
export function parseChoice(text: string, candidateCount: number): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const match = (parsed as { match?: unknown })?.match;
  if (typeof match !== "number" || !Number.isInteger(match)) return null;
  const index = match - 1; // the model is shown a 1-based list
  return index >= 0 && index < candidateCount ? index : null;
}

export type Matcher = (claim: string, candidates: CacheEntry[]) => Promise<CacheEntry | null>;

export const askModel: Matcher = async (claim, candidates) => {
  if (!candidates.length) return null;
  const list = candidates.map((c, i) => `${i + 1}. ${c.claim}`).join("\n");
  try {
    const message = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 64,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Already answered:\n${list}\n\nNew claim: ${claim}` }],
      // A schema, not a bare number: a plain-text reply can begin with an explanation and be cut
      // off by max_tokens, which silently reads as "no match".
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { match: { type: ["integer", "null"], description: "The matching claim's number, or null." } },
            required: ["match"],
            additionalProperties: false,
          },
        },
      },
    });
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const index = parseChoice(text, candidates.length);
    console.log(`[bias-check] similar-claim check: ${candidates.length} candidate(s) → ${text.trim() || "no reply"}`);
    return index === null ? null : candidates[index];
  } catch (e) {
    // A failed match just means a full check runs, so never let it break the request.
    console.warn("[bias-check] similar-claim check failed", e);
    return null;
  }
};
