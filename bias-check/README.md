# Bias Check

Type a claim you believe. The site researches it against an allow-list of trustworthy sources
(peer-reviewed journals, health and science agencies, statistics offices,
fact-checkers) and returns a verdict, a plain-language summary focused on the evidence against
the claim, and the sources it cited. If the claim is right, it says so.

## Run locally

Requires Node 23.6+ (24 recommended).

    cp .env.local.example .env.local   # then paste your Anthropic API key
    npm install
    npm run dev                        # http://localhost:3000

## Tests

    npm test        # unit tests, no network
    npm run smoke   # one real end-to-end check (spends API credit)

## Model and cost

Checks run on `claude-opus-5` at medium effort with up to 4 web searches, about $0.14 per new claim
(measured). Sonnet 5 reaches the same verdicts at about $0.04 but its summaries are noticeably vaguer;
set `BIAS_CHECK_MODEL=claude-sonnet-5` in `.env.local` if cost matters more than specificity. Repeated claims are served from an in-memory cache and cost nothing.

## Community sign-ups

When a verdict is UNVERIFIABLE the result offers "Ask the community". The community isn't live yet,
so the dialog explains how it will work and collects sign-ups: email plus gender, age range and
ethnicity, each with a "Prefer not to say" option, so future answers can be shown by group rather
than by person. `POST /api/community` validates every field against the allow-lists in `lib/community.ts`, requires
an explicit consent tick, and stores the sign-up in Redis.

## Sharing a result

Every completed check is saved under a 16-character random id, and the
result view offers a Share button. On devices with a share sheet it opens the usual share options;
elsewhere it copies the link, and if the clipboard is blocked it shows the link to copy by hand.
The recipient opens `/r/<id>` and sees the same verdict, summary and sources. Results are reachable
by link only and are marked `noindex`; nothing lists them.


## Storage

All state lives in one Upstash Redis database: shared results (`result:<id>`), community sign-ups
(`community`), the result cache (`cache:<claim>`, 30 days), the rate-limit counters (`rl:ip:…`,
`rl:global:…`) and the monthly budget counter (`budget:<YYYY-MM>`). Nothing is written to disk, so
the app runs unchanged on a read-only filesystem.

Without `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` the app falls back to in-memory
storage and logs a warning. That is fine for local development and for the tests, but everything is
lost when the process restarts.

## Cost controls

A new check costs about $0.14 on Claude Opus 5; cached answers are free and are served before any
limit is counted.

Reuse is not limited to word-for-word repeats. A new claim is first matched exactly, then compared
against the last 300 cached claims: a cheap local token overlap picks up to five candidates, and
Claude Haiku decides whether any of them really asks the same thing, for about $0.0003. When one
does, the reader is shown which earlier belief the answer came from. Two guards keep a reuse from
showing the wrong answer: claims whose quantities differ are rejected in code before the model is
asked, and anything other than a clear match is treated as a miss. Four limits apply, the first three configurable by environment variable:

| Limit | Default | Variable |
|---|---|---|
| Per person, per day | 3 | `PER_IP_DAILY_LIMIT` |
| Everyone, per day | 12 | `GLOBAL_DAILY_LIMIT` |
| New checks per month | 140 (about $20) | `MONTHLY_CHECK_BUDGET` |
| Hard spend limit | set by hand in the Anthropic console | — |

## Deploying to Vercel

1. Create a Redis database at [console.upstash.com](https://console.upstash.com) and copy its REST
   URL and token.
2. Push this repository to GitHub, then import it at [vercel.com/new](https://vercel.com/new) and
   **set the root directory to `bias-check`**.
3. Add `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as environment
   variables for all environments, plus any limits you want to change.
4. Deploy, then set `NEXT_PUBLIC_SITE_URL` to the address Vercel gives you and redeploy, so shared
   links preview correctly.
5. Set a hard monthly spend limit in the Anthropic console as a backstop.
6. Put a real contact address on the privacy page: replace `SET_CONTACT_EMAIL_BEFORE_LAUNCH` in
   `app/privacy/page.tsx`. Deletion requests have to reach someone.

## Editing the trusted-source list

`TRUSTED_DOMAINS` in `lib/factcheck.ts`. Bare hostnames only; subdomains are included automatically; max 64 entries.

## Deploy

Any Node host works. On Vercel: import the repo, set `ANTHROPIC_API_KEY`, and lower
`maxDuration` in `app/api/check/route.ts` to `60` on the Hobby plan. The rate limiter is
in-memory; replace it with a shared store if you run more than one instance.
