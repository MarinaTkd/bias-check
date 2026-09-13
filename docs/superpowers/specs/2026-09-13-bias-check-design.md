# Bias Check — Design Spec

**One-liner:** A single-page website where a person types a claim they believe, and gets back a verdict, a plain-language summary of what trustworthy sources say, and a list of those sources with links. If the claim holds up, the site says so. The purpose is to help people test their own beliefs against evidence, not to win arguments.

## User flow

1. User types a claim (max 500 characters) and presses **Check it**.
2. Spinner for 15–60 s while the server researches.
3. Result appears:
   - **Verdict** badge: one of `FALSE`, `MOSTLY FALSE`, `MIXED`, `MOSTLY TRUE`, `TRUE`, `UNVERIFIABLE`.
   - **Summary**: 2–5 short paragraphs of plain prose explaining what the evidence shows, focused on evidence *against* the claim, but honest when the claim is correct.
   - **Sources**: de-duplicated list of the URLs the model actually cited, each with title and the quoted passage it relied on.
4. Errors (rate limit, refusal, upstream failure) show as a one-line message in the same result area.

## Trustworthiness

Research is restricted at the API level, not by prompt: the Claude web search tool runs with `allowed_domains` set to a fixed allow-list of peer-reviewed publishers, national/international health and science agencies, statistics offices, reference encyclopedias, wire services, and established fact-checkers. Claude cannot cite anything outside that list. The list lives in one constant so it can be edited without touching logic.

## Architecture

- **Next.js (App Router, TypeScript, Tailwind)**, one page and one API route.
- `POST /api/check` `{ claim: string }` → `{ verdict, summary, sources: [{ url, title, quote }] }` or `{ error }`.
- Server calls Claude (`claude-opus-5`) once via streaming with the `web_search_20260209` server tool, resumes on `pause_turn` (max 3 continuations), then:
  - reads the verdict from the first line of the text (`VERDICT: X`),
  - takes the rest as the summary,
  - extracts sources from `citations` on the text blocks (`web_search_result_location` → `url`, `title`, `cited_text`).
- Server-side refusal fallbacks (`fallbacks: "default"`) are enabled so a safety-classifier decline retries on a fallback model in the same call.
- In-memory per-IP rate limit (5 checks per hour). Deliberate shortcut; swap for a store when deployed on more than one instance.
- No database, no auth, no accounts.

## Non-goals (v1)

Streaming tokens to the browser, history, sharing links, user accounts, multiple languages, multi-claim input. All are additive later.

## Constraints

- Node ≥ 24 (native TypeScript type stripping used for tests, `node --test`).
- Tests use only `node:test` and `node:assert` — no test framework.
- Model: `claude-opus-5`, thinking adaptive (default), `max_tokens: 16000`, streaming SDK call.
- Secrets only in `.env.local` (`ANTHROPIC_API_KEY`), never committed.
