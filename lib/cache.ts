import type { CheckResult } from "./factcheck.ts";
import { askModel, type Matcher } from "./matcher.ts";
import { shortlist, type CacheEntry } from "./similar.ts";
import { getStore, type Store } from "./store.ts";

export type CachedResponse = CheckResult & { id: string };
export type CacheHit = { response: CachedResponse; matchedClaim?: string };

const TTL_SECONDS = 30 * 24 * 60 * 60;
const INDEX_KEY = "cache:index";
const INDEX_MAX = 300; // how many past claims a new one is compared against

export function cacheKey(claim: string): string {
  return `cache:${claim.toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim()}`;
}

// Looks for an answer worth reusing. An exact repeat is free and immediate. Otherwise a cheap
// local pass narrows the cached claims to a handful and the model decides whether any of them
// really asks the same thing; that call costs a fraction of a cent against $0.14 for a re-check.
export async function lookup(claim: string, store: Store = getStore(), matcher: Matcher = askModel): Promise<CacheHit | null> {
  const exact = await store.get<CachedResponse>(cacheKey(claim));
  if (exact) return { response: exact };

  const index = (await store.get<CacheEntry[]>(INDEX_KEY)) ?? [];
  const candidates = shortlist(claim, index);
  if (!candidates.length) return null;

  const chosen = await matcher(claim, candidates);
  if (!chosen) return null;

  // The index can outlive the answer it points at, so a miss here is normal, not an error.
  const response = await store.get<CachedResponse>(chosen.key);
  return response ? { response, matchedClaim: chosen.claim } : null;
}

export async function remember(
  claim: string,
  response: CachedResponse,
  store: Store = getStore(),
  ttlSeconds = TTL_SECONDS,
): Promise<void> {
  const key = cacheKey(claim);
  await store.set(key, response, ttlSeconds);
  const index = (await store.get<CacheEntry[]>(INDEX_KEY)) ?? [];
  const withoutThis = index.filter((entry) => entry.key !== key);
  await store.set(INDEX_KEY, [...withoutThis, { claim: claim.trim(), key }].slice(-INDEX_MAX));
}
