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

Checks run on `claude-sonnet-5` at medium effort with up to 4 web searches, about $0.05 per new claim
(measured; Opus 5 gave the same verdicts at roughly $0.14). Set `BIAS_CHECK_MODEL=claude-opus-5` in
`.env.local` to use the heavier model. Repeated claims are served from an in-memory cache and cost nothing.

## Editing the trusted-source list

`TRUSTED_DOMAINS` in `lib/factcheck.ts`. Bare hostnames only; subdomains are included automatically; max 64 entries.

## Deploy

Any Node host works. On Vercel: import the repo, set `ANTHROPIC_API_KEY`, and lower
`maxDuration` in `app/api/check/route.ts` to `60` on the Hobby plan. The rate limiter is
in-memory; replace it with a shared store if you run more than one instance.
