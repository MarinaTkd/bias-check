import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CheckResult } from "./factcheck.ts";

export type SavedResult = { id: string; claim: string; result: CheckResult; createdAt: string };

// ponytail: one JSON file per result; needs a persistent disk. Move to a database before
// deploying anywhere with an ephemeral filesystem.
const RESULTS_DIR = "data/results";

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

export async function saveResult(claim: string, result: CheckResult, dir = RESULTS_DIR): Promise<string> {
  const saved: SavedResult = { id: newResultId(), claim: claim.trim(), result, createdAt: new Date().toISOString() };
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${saved.id}.json`), JSON.stringify(saved));
  return saved.id;
}

export async function loadResult(id: string, dir = RESULTS_DIR): Promise<SavedResult | null> {
  if (!isResultId(id)) return null; // never build a path from an unvalidated id
  try {
    return JSON.parse(await readFile(join(dir, `${id}.json`), "utf8")) as SavedResult;
  } catch {
    return null;
  }
}
