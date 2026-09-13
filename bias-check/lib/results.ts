import type { CheckResult } from "./factcheck.ts";
import { getStore, type Store } from "./store.ts";

export type SavedResult = { id: string; claim: string; result: CheckResult; createdAt: string };

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 16;

// Unguessable rather than sequential: claims are the user's own words, and the id is the only
// thing protecting a shared result.
export function newResultId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function isResultId(id: string): boolean {
  return typeof id === "string" && new RegExp(`^[a-z0-9]{${ID_LENGTH}}$`).test(id);
}

export async function saveResult(claim: string, result: CheckResult, store: Store = getStore()): Promise<string> {
  const saved: SavedResult = { id: newResultId(), claim: claim.trim(), result, createdAt: new Date().toISOString() };
  await store.set(`result:${saved.id}`, saved);
  return saved.id;
}

export async function loadResult(id: string, store: Store = getStore()): Promise<SavedResult | null> {
  if (!isResultId(id)) return null; // a malformed id can never become a lookup
  return await store.get<SavedResult>(`result:${id}`);
}
