# Deploy to Vercel — Design Spec

**One-liner:** Put Check Your Bias on the public internet at a `vercel.app` address, with every piece of state moved off the local filesystem, spending capped at roughly $20 a month, and the personal data it collects handled lawfully.

## Why this is not just "press deploy"

Four pieces of state currently live in memory or on local disk. Vercel runs many short-lived instances on a read-only filesystem, so all four break there, and two of them break silently:

| State | Today | On Vercel without change |
|---|---|---|
| Shared results | `data/results/<id>.json` | Write throws; every share link 502s |
| Community sign-ups | `data/community.jsonl` | Write throws; every join fails |
| Rate limiter | In-memory counters | Each instance counts separately, so the cap does nothing and spending is unbounded |
| Result cache | In-memory `Map` | Near-useless hit rate, so repeats cost full price |

The rate limiter is the dangerous one: it is the only thing standing between a public endpoint and an unbounded Anthropic bill.

## Storage: one store, not two

All four are key-value with short values and natural expiry, so they go in a single **Upstash Redis** database rather than a Postgres database plus a Redis cache. Postgres would add a schema, migrations, a SQL client and a second dashboard for no gain at this size. The shapes are:

| Key | Holds | Expiry |
|---|---|---|
| `result:<id>` | The saved result JSON | none |
| `community` | A list of sign-ups | none |
| `cache:<claim>` | A previous result for that claim | 30 days |
| `rl:ip:<ip>:<day>` | Per-person counter | 2 days |
| `rl:global:<day>` | All-users counter | 2 days |
| `budget:<YYYY-MM>` | Checks bought this month | 70 days |

A `Store` interface sits in front, with an in-memory implementation used by the tests and by local development when no Redis credentials are present. Nothing outside `lib/store.ts` knows Redis exists.

## Spending: about $20 a month

At the measured $0.14 per new check on Claude Opus 5, $20 buys about 140 checks. Cached repeats are free and do not count. Four independent limits, in order of how hard they bite:

1. **Per person:** 3 checks per day.
2. **Everyone together:** 12 checks per day.
3. **Monthly budget:** 140 new checks, after which the site says so plainly until the month rolls over.
4. **Anthropic console hard spend limit**, set by hand, as the backstop that does not depend on this code being correct.

All three app limits are environment variables, so they can be raised without a code change. Setting `BIAS_CHECK_MODEL=claude-sonnet-5` makes the same money buy roughly five times as many checks, at the cost of vaguer summaries.

## Personal data

The community form collects email, gender, age range and **ethnicity**. Under GDPR, which applies here, ethnicity is special category data and needs explicit consent and a privacy notice; the rest needs a lawful basis and a stated retention period. This is not legal advice, and the wording should be reviewed before launch, but the mechanism has to exist before the form is public:

- An unticked consent checkbox that must be ticked to submit, stating what is collected and why.
- A short privacy page covering what is stored, why, for how long, and how to have it deleted.
- A contact address for deletion requests, since the right to erasure applies from day one.

Shared results are also user-written text. They stay unlisted, `noindex`, and reachable only by an unguessable id, as today.

## Function duration

Checks take 10 to 20 seconds and can occasionally continue past that. Vercel Hobby allows up to 60 seconds per request, so `maxDuration` drops from 300 to 60. A check that exceeds it returns a gateway timeout, which the page already reports as a failed check.

## What "done" looks like

The site answers at its `vercel.app` address over HTTPS. A check runs end to end, its share link opens in a different browser, a sign-up is stored, the rate limit returns 429 on the fourth check from one address in a day, and the Anthropic console shows a spend limit.

## Non-goals

A custom domain, analytics, a database admin UI, and any migration of the local `data/` files, which are development scratch.

## Constraints

- The app sits at the repository root, alongside `docs/`; no Vercel root directory setting is needed.
- One new dependency: `@upstash/redis`. No others.
- Tests use `node:test` and `node:assert/strict` only, and must run with no Redis credentials present.
- `.env.local` and `data/` must never be committed.
