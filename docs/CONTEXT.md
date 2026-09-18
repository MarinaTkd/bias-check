# Check Your Bias — working context

Read this first in a new session. It holds the decisions behind the code and the traps that have
already cost time. Last updated 2026-09-18.

## What it is

A person types a belief they hold. The app researches it against an allow-list of trustworthy
sources and returns a verdict, a short data-dense summary with inline citations, and the sources.
The summary deliberately leans toward evidence **against** the belief, because the reader is
checking their own bias; when the evidence supports them it says so plainly.

Tagline: "Type a belief. Read the evidence."

## Shape of the code

Next.js 16 App Router, TypeScript, Tailwind v4, **at the repository root**. Node 23.10 locally,
running `.ts` natively, which is why imports inside `lib/` carry the `.ts` extension. Tests are
`node:test` + `node:assert/strict` only, no framework: `npm test` (54 at last count). One added
dependency in the whole project, `@upstash/redis`.

| Path | Holds |
|---|---|
| `lib/factcheck.ts` | The research call, the system prompt, verdict parsing, citation segments |
| `lib/domains.ts` | The 45-domain allow-list, grouped by category. The single place to edit sources |
| `lib/store.ts` | `Store` interface, in-memory and Upstash implementations. The only file that knows Redis exists |
| `lib/cache.ts` | Exact and similar-claim reuse, plus the cache index |
| `lib/similar.ts` | Cheap local token comparison and the quantity guard |
| `lib/matcher.ts` | The Haiku equivalence judge |
| `lib/limits.ts` | Per-person, global and monthly spend caps |
| `lib/results.ts` | Saving and loading a shared result by id |
| `app/page.tsx` | The whole UI, a client component. Also rendered by `/r/[id]` with initial state |
| `app/api/check/route.ts` | Validation, cache, limits, research, save |

## Decisions, and why

**Trust is enforced by the API, not the prompt.** The web search tool is given
`allowed_domains: TRUSTED_DOMAINS`, so the model physically cannot cite anything else. A prompt
instruction would be a suggestion; this is a constraint.

**`allowed_callers: ["direct"]` on the search tool is load-bearing.** Without it the newer search
tool routes through a code-execution step that strips every citation and roughly doubles input
tokens. Every early run returned zero sources for exactly this reason. Do not remove it.

**Domains that block Anthropic's crawler must stay out of the list.** Reuters, AP News and both BBC
domains do, and including even one makes the whole request fail with a 400 naming it. This is why
there are no wire services in the allow-list.

**Model is `claude-opus-5` at `effort: medium`, four searches.** Sonnet 5 was measured on the same
prompt: same verdicts, about a fifth of the cost, noticeably vaguer summaries ("examined
double-blind trials" against Opus's "1995 JAMA meta-analysis of 23 double-blind trials"). Since the
point is specificity, Opus won. `BIAS_CHECK_MODEL` overrides it without a code change.

**The prompt demands data.** At most 130 words and 3 paragraphs, every sentence carrying a number,
sample size, year or named study, with filler phrases such as "research shows" banned. Before this,
answers ran to 400 vague words. Changing the prompt is the main lever on answer quality.

**One Redis database, not a database plus a cache.** Everything persisted here is key-value with
short values and natural expiry, so Postgres would add a schema, migrations and a second dashboard
for nothing. Keys: `result:<id>`, `community`, `cache:<claim>`, `cache:index`, `rl:ip:<ip>:<day>`,
`rl:global:<day>`, `budget:<YYYY-MM>`.

**Spending is capped in four independent places.** 3 checks per person per day, 12 across everyone
per day, 140 new checks per month (about $20 at $0.14 each), and a hard limit set by hand in the
Anthropic console that does not depend on this code being correct. The first three are environment
variables. Cached answers are free and are served **before** any limit is counted, as are invalid
requests, so neither burns someone's daily allowance.

**Answers are reused for reworded claims.** Exact match first, then a local token comparison picks
up to five of the last 300 cached claims, then Haiku decides whether any really asks the same
thing, for about $0.0003 against $0.14 saved. When one matches, the reader is told which earlier
belief the answer came from, because quietly serving someone else's answer would be wrong for this
particular product.

**Two guards stop a wrong reuse**, which matters more than a wasted dollar. Claims whose quantities
differ are rejected in code before the model is asked, because the model was observed matching
"use 10% of their brains" to "use 90% of their brains" despite the prompt forbidding it. Anything
ambiguous counts as a miss.

**Sharing persists the result.** Each check is saved under a 16-character unguessable id and shared
as a link to `/r/<id>`, so the recipient sees the verdict, summary and sources rather than a
paragraph of text. Results are `noindex` and reachable only by the link.

**Ethnicity on the community form is special category data under GDPR.** The server rejects a
sign-up without `consent: true`, the form has an unticked checkbox, and `/privacy` explains what is
stored and how to have it deleted. Under-18s are excluded from joining, though anyone may use the
site.

**The community email is a stopgap.** The intended end state is accounts with in-app notification
matched on the stored demographics. Do not invest further in the email path, and treat the stored
sign-ups as throwaway rather than a schema to build on.

## Traps that already cost time

**A module-level singleton is not one value per process in Next.** Route handlers and server
components are bundled separately, so the in-memory store existed twice and every share link came
back "not found" locally. The fallback now hangs off `globalThis`. With Redis it does not matter,
since both bundles reach the same database.

**A parent layout's `openGraph` is not overridden by a child's `title`.** Shared result pages set
`openGraph` explicitly, or link previews show generic boilerplate instead of the claim and verdict.

**A gradient on a perfectly horizontal SVG line paints nothing**, because the bounding box has zero
height. Use `gradientUnits="userSpaceOnUse"`.

**The API returns cited text as separate blocks with no separators.** Joining them needs a space
after sentence-ending punctuation and whitespace stripped before punctuation, or you get
"staff.A 1994 trial". Tool-separated blocks need a newline so a verdict line after a preamble still
starts a line.

**Too small a `max_tokens` on a classification call silently reads as "no answer".** The Haiku judge
was capped at 8 tokens, began explaining, got truncated, and every match failed. It now uses a JSON
schema so the reply cannot be ambiguous.

**Vercel build log timings are the diagnostic.** A build finishing in tens of milliseconds means it
is building a directory with no app in it. "Installing dependencies... up to date in 479ms" means
no real `package.json` was found. A correct build installs about 300 packages and takes roughly
thirty seconds. The app was moved from `bias-check/` to the repository root precisely so that no
root-directory setting can be wrong again.

**An empty directory is not tracked by git**, which is why `public/` does not exist on Vercel.

## Design

Charcoal `#2C2B30` canvas, `#4F4F51` for glass surfaces, off-white text, and coral `#F58F7C` to
blush `#F2C4CE` as the single accent. Bricolage Grotesque for display, Instrument Sans for reading,
IBM Plex Mono for labels. The verdict is the hero: a huge word in a gradient block, the claim struck
through beneath it, and drifting background blobs that take the verdict's colour. A Müller-Lyer
illusion sits in the hero as the one decorative element, because it is a picture of perception
misleading you.

Earlier directions were rejected along the way: editorial serif on cream read too quiet, black and
white too harsh, indigo and violet gradients too generic, pastel text too weak. Reduced motion is
respected throughout and keyboard focus stays visible.

## Open items

- **Deploy is unfinished.** Re-import the project on Vercel after the root move; no configuration is
  needed now. Then set `NEXT_PUBLIC_SITE_URL` to the deployed address and redeploy so link previews
  resolve.
- **`SET_CONTACT_EMAIL_BEFORE_LAUNCH` in `app/privacy/page.tsx`** must become a real address before
  the site is public, or deletion requests have nowhere to go.
- **Set a $25 monthly spend limit in the Anthropic console.**
- **The live smoke test has never run:** a check, a share link opened cold, a reworded claim hitting
  the cache, a fourth check refused, a sign-up stored, and the Upstash console showing it.

## Working agreements

Tests, type check and lint before every commit, and a production build before claiming deployment
readiness. Verify claims by running things rather than reasoning about them: every bug in the traps
list above was found that way and would have shipped otherwise. Plans and specs for larger pieces
live in `docs/superpowers/`.
