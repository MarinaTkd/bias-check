# Share a result Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let someone share a completed check through their device's usual share options, so the recipient opens a link showing the same verdict, summary and sources.

**Architecture:** Each completed check is written to `data/results/<id>.json` with an unguessable 16-character id, and `POST /api/check` returns that id. A Share button on the result uses `navigator.share` where it exists and falls back to copying the link. `/r/<id>` is a thin server component that loads the saved result and renders the existing client page with initial state, so there is only one result rendering in the codebase.

**Tech Stack:** Next.js 16 App Router · TypeScript · Tailwind · `node:fs/promises` · `node:test`

**Spec:** `docs/superpowers/specs/2026-09-13-share-result-design.md`

## Global Constraints

- All paths are relative to `bias-check/`. Run `npm`, `npx` and `git` from inside that directory.
- Node 23.10 runs `.ts` natively. Tests use only `node:test` + `node:assert/strict`. No new dependencies.
- Result ids are exactly 16 characters from the alphabet `abcdefghijklmnopqrstuvwxyz0123456789`.
- Results are stored at `data/results/<id>.json`. `data/` is already git-ignored and must stay so.
- Never build a filesystem path from an id that has not passed `isResultId`.
- Existing behaviour must not change: the rate limiter runs before validation, `Error("refused")` maps to 422 and every other error to 502.
- Commit after every task using the message given in that task's final step.

---

## File Structure

| Path | Responsibility |
|---|---|
| `lib/results.ts` | Id generation and validation, save and load a result as JSON on disk. No React, no Anthropic SDK. |
| `lib/results.test.ts` | Unit tests for id validation and the save/load round trip, using a temporary directory. |
| `app/api/check/route.ts` | Saves each new result and returns its `id`; cache carries the id. |
| `app/page.tsx` | Accepts optional initial state; renders the Share button. |
| `app/r/[id]/page.tsx` | Server component: loads a saved result, sets link-preview metadata, renders the client page. |
| `README.md` | Documents the share feature and the storage shortcut. |

---

### Task 1: Result storage

**Files:**
- Create: `lib/results.ts`
- Test: `lib/results.test.ts`

**Interfaces:**
- Consumes: `CheckResult` from `@/lib/factcheck` (type only).
- Produces:
  - `type SavedResult = { id: string; claim: string; result: CheckResult; createdAt: string }`
  - `newResultId(): string` — 16 chars of `[a-z0-9]`
  - `isResultId(id: string): boolean`
  - `saveResult(claim: string, result: CheckResult, dir?: string): Promise<string>` — returns the new id
  - `loadResult(id: string, dir?: string): Promise<SavedResult | null>` — null for an invalid or missing id

- [ ] **Step 1: Write the failing tests**

Create `lib/results.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isResultId, loadResult, newResultId, saveResult } from "./results.ts";

const RESULT = {
  verdict: "FALSE" as const,
  summary: "No link was found.",
  segments: [{ text: "No link was found.", refs: [1] }],
  sources: [{ url: "https://who.int/a", title: "WHO", quote: "no link" }],
};

test("newResultId makes 16 lowercase alphanumeric characters, and they differ", () => {
  const a = newResultId();
  assert.match(a, /^[a-z0-9]{16}$/);
  assert.notEqual(a, newResultId());
});

test("isResultId accepts real ids and rejects anything that could escape the directory", () => {
  assert.ok(isResultId(newResultId()));
  for (const bad of ["", "short", "../../etc/passwd", "a".repeat(17), "ABCDEFGHIJKLMNOP", "abcd efgh ijkl mn", "abcdefghijklmno/"]) {
    assert.equal(isResultId(bad), false, `${JSON.stringify(bad)} should be rejected`);
  }
});

test("saveResult then loadResult returns the same claim and result", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bias-check-"));
  const id = await saveResult("  Vaccines cause autism.  ", RESULT, dir);
  assert.ok(isResultId(id));

  const saved = await loadResult(id, dir);
  assert.equal(saved?.id, id);
  assert.equal(saved?.claim, "Vaccines cause autism.");
  assert.deepEqual(saved?.result, RESULT);
  assert.match(saved!.createdAt, /^\d{4}-\d{2}-\d{2}T/);

  const onDisk = JSON.parse(await readFile(join(dir, `${id}.json`), "utf8"));
  assert.equal(onDisk.claim, "Vaccines cause autism.");
});

test("loadResult returns null for an unknown id and never reads outside the directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bias-check-"));
  assert.equal(await loadResult("abcdefghijklmnop", dir), null);
  assert.equal(await loadResult("../../../etc/passwd", dir), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module './results.ts'`.

- [ ] **Step 3: Write the implementation**

Create `lib/results.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests pass, including the four new ones.

- [ ] **Step 5: Commit**

```bash
git add lib/results.ts lib/results.test.ts
git commit -m "feat: save each result under an unguessable id"
```

---

### Task 2: Return the id from the check API

**Files:**
- Modify: `app/api/check/route.ts`

**Interfaces:**
- Consumes: `saveResult(claim, result, dir?)` from Task 1.
- Produces: `POST /api/check` responds `200 { verdict, summary, segments, sources, id }`. The id is stable for a cached claim.

- [ ] **Step 1: Change the cache to hold the id alongside the result**

In `app/api/check/route.ts`, change the import line:

```ts
import { checkClaim, type CheckResult } from "@/lib/factcheck";
import { saveResult } from "@/lib/results";
```

Change the cache declaration from `const cache = new Map<string, CheckResult>();` to:

```ts
type CheckResponse = CheckResult & { id: string };
const cache = new Map<string, CheckResponse>();
```

- [ ] **Step 2: Save the result and return its id**

Replace the `try` block body so it reads:

```ts
  try {
    const result = await checkClaim(claim);
    const id = await saveResult(claim, result);
    const response: CheckResponse = { ...result, id };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, response);
    return NextResponse.json(response);
  } catch (e) {
```

Leave the `catch` block exactly as it is.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Verify against the running app**

Start the dev server if it is not running: `npm run dev`

```bash
curl -s -X POST localhost:3000/api/check -H 'content-type: application/json' -d '{"claim":"Goldfish have a three-second memory."}' | head -c 400
```

Expected: JSON containing `"id":"<16 characters>"`. Run the same command again and confirm the `id` is identical (served from cache) and that only one file exists:

```bash
ls data/results | wc -l
```

Expected: `1`.

- [ ] **Step 5: Commit**

```bash
git add app/api/check/route.ts
git commit -m "feat: return a shareable id with each check"
```

---

### Task 3: Share button

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: the `id` field on the `/api/check` response from Task 2.
- Produces: `Page` keeps the result id in state as `resultId` and renders a Share button beside "Check another belief".

- [ ] **Step 1: Track the id returned by the API**

In `app/page.tsx`, add this state declaration immediately after the `const [error, setError] = useState<string | null>(null);` line:

```tsx
  const [resultId, setResultId] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
```

In `submit`, replace `else setResult(data);` with:

```tsx
      else {
        setResult(data);
        setResultId(typeof data.id === "string" ? data.id : null);
      }
```

In `submit`, add `setResultId(null);` directly beneath the existing `setResult(null);`. In `reset`, add `setResultId(null);` and `setShareNote(null);` beneath its existing `setResult(null);`.

- [ ] **Step 2: Add the share handler**

Add this function directly above `function reset() {`:

```tsx
  // The device's own share sheet where it exists, clipboard everywhere else.
  async function share() {
    if (!resultId) return;
    const url = `${window.location.origin}/r/${resultId}`;
    const text = result ? `"${checked}" — ${VERDICT[result.verdict].label}` : checked ?? "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Check Your Bias", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied");
    } catch {
      // A cancelled share sheet throws AbortError; say nothing in that case.
      if (!navigator.share) setShareNote("Couldn't copy the link");
    }
    setTimeout(() => setShareNote(null), 2000);
  }
```

- [ ] **Step 3: Render the button**

Replace the "Check another belief" button block with this, so the two buttons sit side by side:

```tsx
                <div className="mt-12 flex flex-wrap items-center gap-3">
                  <button
                    onClick={reset}
                    className="brand-bg rounded-full px-6 py-3 font-display text-base font-bold text-bg shadow-[0_10px_30px_-10px_rgba(245,143,124,0.45)] transition hover:scale-[1.03]"
                  >
                    Check another belief
                  </button>
                  {resultId && (
                    <button
                      onClick={share}
                      className="glass rounded-full px-6 py-3 font-display text-base font-bold text-fg transition hover:scale-[1.03]"
                    >
                      Share
                    </button>
                  )}
                  <span className="font-mono text-xs text-muted" aria-live="polite">
                    {shareNote}
                  </span>
                </div>
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Check it in the browser**

With `npm run dev` running, open `http://localhost:3000`, check a claim, and confirm a Share button appears next to "Check another belief". Press it. On a desktop browser with no share sheet, "Link copied" appears for two seconds and the clipboard holds a `http://localhost:3000/r/<id>` URL.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx
git commit -m "feat: share button using the device share sheet, clipboard as fallback"
```

---

### Task 4: The shared result page

**Files:**
- Create: `app/r/[id]/page.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `loadResult(id, dir?)` and `SavedResult` from Task 1; the `Page` component from `app/page.tsx`.
- Produces: `Page` accepts optional props `{ initialClaim?: string; initialResult?: CheckResult; initialId?: string }`. A route at `/r/<id>`.

- [ ] **Step 1: Let the page accept initial state**

In `app/page.tsx`, replace the component signature line `export default function Page() {` with:

```tsx
export default function Page({
  initialClaim,
  initialResult,
  initialId,
}: {
  initialClaim?: string;
  initialResult?: CheckResult;
  initialId?: string;
} = {}) {
```

Then change these four state initialisers so a shared result renders immediately:

```tsx
  const [claim, setClaim] = useState("");
  const [checked, setChecked] = useState<string | null>(initialClaim ?? null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(initialResult ?? null);
```

and

```tsx
  const [resultId, setResultId] = useState<string | null>(initialId ?? null);
```

Note `CheckResult` is already imported as a type at the top of the file; do not add a second import.

- [ ] **Step 2: Create the route**

Create `app/r/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { loadResult } from "@/lib/results";
import Page from "../../page";

// Shared results are reachable by link only; keep them out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const saved = await loadResult((await params).id);
  if (!saved) return { title: "Result not found", robots: { index: false, follow: false } };
  const verdict = saved.result.verdict.toLowerCase();
  const firstSentence = saved.result.summary.split(/(?<=[.!?])\s/)[0] ?? "";
  return {
    title: `"${saved.claim}" — ${verdict}`,
    description: `Checked against trusted sources: ${verdict}. ${firstSentence}`.slice(0, 200),
    robots: { index: false, follow: false },
  };
}

export default async function SharedResult({ params }: { params: Promise<{ id: string }> }) {
  const saved = await loadResult((await params).id);

  if (!saved) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center px-5 py-24 sm:px-8">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">This result isn&rsquo;t available</h1>
        <p className="mt-3 text-lg text-muted">The link may be wrong, or the result may have been removed.</p>
        <Link
          href="/"
          className="brand-bg mt-8 rounded-full px-6 py-3 font-display text-base font-bold text-bg transition hover:scale-[1.03]"
        >
          Check a belief
        </Link>
      </main>
    );
  }

  return <Page initialClaim={saved.claim} initialResult={saved.result} initialId={saved.id} />;
}
```

- [ ] **Step 3: Type-check, lint and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all three pass, and the build output lists a `/r/[id]` route.

- [ ] **Step 4: Verify the round trip in the browser**

With `npm run dev` running:
1. Open `http://localhost:3000`, check a claim, press Share, and copy the link.
2. Open that link in a new tab. The verdict block, summary with citation chips and source cards all appear, without re-running the research (the terminal shows no `[bias-check] start` line).
3. Press "Check another belief" on the shared page and confirm the input returns.
4. Open `http://localhost:3000/r/abcdefghijklmnop` and confirm the "This result isn't available" page.
5. Open `http://localhost:3000/r/..%2F..%2Fetc%2Fpasswd` and confirm the same not-available page rather than an error.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/r
git commit -m "feat: shared result page at /r/<id> with link-preview metadata"
```

---

### Task 5: Document it

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a section**

Add this above the "## Editing the trusted-source list" heading in `README.md`:

```markdown
## Sharing a result

Every completed check is saved to `data/results/<id>.json` with a 16-character random id, and the
result view offers a Share button. On devices with a share sheet it opens the usual share options;
elsewhere it copies the link. The recipient opens `/r/<id>` and sees the same verdict, summary and
sources. Results are reachable by link only and are marked `noindex`; nothing lists them.

Like the community sign-ups, this storage is a local-file shortcut that needs a persistent disk.
Move it to a database before deploying anywhere with an ephemeral filesystem.
```

- [ ] **Step 2: Full verification**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document result sharing"
```

---

## Self-Review

**Spec coverage:** share button beside "Check another belief" (Task 3), native share sheet with clipboard fallback and a two-second confirmation (Task 3), saved result per check (Task 1), stable id for a repeated claim (Task 2), recipient sees verdict, summary and sources (Task 4), missing id shows a short page with a link home (Task 4), unguessable 16-character id (Task 1), `noindex` (Task 4), link-preview title and description (Task 4), one result rendering reused (Task 4 reuses `Page`), storage shortcut documented (Task 5). Non-goals untouched.

**Placeholders:** none; every code step carries its full code.

**Type consistency:** `SavedResult`, `newResultId`, `isResultId`, `saveResult`, `loadResult` are defined in Task 1 and used with those exact names in Tasks 2 and 4. `CheckResponse = CheckResult & { id: string }` exists only inside the route (Task 2); the page reads `data.id` defensively rather than importing that type. `Page`'s three optional props in Task 4 match the three passed by the route.

**Known risk, flagged in-plan:** `app/r/[id]/page.tsx` imports the client component from `app/page.tsx`, which is an unusual import path for a Next route. Task 4 Step 3 builds the app specifically to catch that early; if the build rejects it, move the client component to `app/ClaimChecker.tsx` and have both routes render it.
