// A cheap, local first pass over cached claims. Its only job is recall: narrow hundreds of cached
// claims down to a handful worth asking the model about. It deliberately does NOT decide whether
// two claims mean the same thing — "X causes Y" and "X does not cause Y" differ by one short word
// and score as near-identical here, so the judgement belongs to `lib/matcher.ts`.

// Words that carry no meaning for this purpose. Negations, quantifiers and comparatives are
// deliberately absent: dropping them would make opposite claims look identical.
const FILLER = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "am",
  "do", "does", "did", "of", "to", "in", "on", "at", "for", "from", "with",
  "that", "this", "these", "those", "it", "its", "you", "your", "we", "our",
  "they", "their", "them", "i", "my", "me", "he", "she", "his", "her",
  "and", "or", "but", "as", "by", "if", "then", "so", "than", "there", "here",
  "really", "actually", "just", "even", "also", "about", "because", "when",
]);

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", twenty: "20",
  fifty: "50", hundred: "100", thousand: "1000", million: "1000000",
};

// Contractions that hide a negation inside a single word.
const NEGATIONS = /\b(can't|cannot|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|shouldn't|couldn't|wouldn't|hasn't|haven't)\b/g;

function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokenise(claim: string): string[] {
  const normalised = claim
    .toLowerCase()
    .replace(NEGATIONS, "not")
    .replace(/%/g, " percent ")
    .replace(/[^a-z0-9\s]/g, " ");
  const out: string[] = [];
  for (const raw of normalised.split(/\s+/)) {
    if (!raw) continue;
    const word = NUMBER_WORDS[raw] ?? raw;
    if (FILLER.has(word)) continue;
    const stemmed = stem(word);
    if (!out.includes(stemmed)) out.push(stemmed);
  }
  return out;
}

// Dice coefficient over the two token sets: 0 for nothing shared, 1 for the same tokens.
export function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const inBoth = a.filter((t) => b.includes(t)).length;
  return (2 * inBoth) / (a.length + b.length);
}

// The quantities a claim rests on. A claim with different numbers is a different claim, and the
// model has been observed matching "use 10% of their brains" to "use 90% of their brains", so this
// is enforced in code where no amount of prompt wording can override it.
export function numbersOf(claim: string): string[] {
  return tokenise(claim)
    .filter((t) => /^\d+$/.test(t))
    .sort();
}

function sameQuantities(a: string, b: string): boolean {
  const [x, y] = [numbersOf(a), numbersOf(b)];
  return x.length === y.length && x.every((n, i) => n === y[i]);
}

export type CacheEntry = { claim: string; key: string };

// Deliberately low: wording varies a lot ("kids" vs "children", "hyper" vs "hyperactive"), a
// candidate that reaches the model costs a fraction of a cent, and the model is the gate on
// precision. Unrelated claims still score near zero and never get here.
const MIN_SIMILARITY = 0.34;

export function shortlist(claim: string, entries: CacheEntry[], max = 5): CacheEntry[] {
  const mine = tokenise(claim);
  return entries
    .filter((entry) => sameQuantities(claim, entry.claim))
    .map((entry) => ({ entry, score: similarity(mine, tokenise(entry.claim)) }))
    .filter(({ score }) => score >= MIN_SIMILARITY)
    .sort((x, y) => y.score - x.score)
    .slice(0, max)
    .map(({ entry }) => entry);
}
