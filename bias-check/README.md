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
than by person. `POST /api/community` validates every field against the allow-lists in
`lib/community.ts` and appends to `data/community.jsonl`, which is git-ignored. That file holds
personal data and only survives on a persistent disk. Move it to a database before deploying
anywhere with an ephemeral filesystem.

## Sharing a result

Every completed check is saved to `data/results/<id>.json` under a 16-character random id, and the
result view offers a Share button. On devices with a share sheet it opens the usual share options;
elsewhere it copies the link, and if the clipboard is blocked it shows the link to copy by hand.
The recipient opens `/r/<id>` and sees the same verdict, summary and sources. Results are reachable
by link only and are marked `noindex`; nothing lists them.

Like the community sign-ups, this storage is a local-file shortcut that needs a persistent disk.
Move it to a database before deploying anywhere with an ephemeral filesystem.

## Editing the trusted-source list

`TRUSTED_DOMAINS` in `lib/factcheck.ts`. Bare hostnames only; subdomains are included automatically; max 64 entries.

## Deploy

Any Node host works. On Vercel: import the repo, set `ANTHROPIC_API_KEY`, and lower
`maxDuration` in `app/api/check/route.ts` to `60` on the Hobby plan. The rate limiter is
in-memory; replace it with a shared store if you run more than one instance.
