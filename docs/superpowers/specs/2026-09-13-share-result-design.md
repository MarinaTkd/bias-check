# Share a result — Design Spec

**One-liner:** After a check completes, the person can share that exact result with someone else through their device's usual share options, and the recipient opens a link that shows the same verdict, summary and sources.

## Why a link, not text

Sharing plain text would send the recipient a paragraph with no verdict styling, no inline citations and no source list, which is most of what the result is. So each completed check is saved under a short id and gets its own address. The share sheet sends that link.

## User flow

1. A check completes. A **Share** button sits next to "Check another belief".
2. Pressing it opens the operating system's share sheet (`navigator.share`) carrying the claim, the verdict and the link. That is the "usual share options": Messages, WhatsApp, Mail, AirDrop, and so on, whatever the device offers.
3. Where the share sheet is unavailable (most desktop browsers), the button copies the link to the clipboard instead and says **Link copied** for two seconds.
4. The recipient opens `/r/<id>` and sees the claim, the verdict block, the summary with its citation chips, and the source cards, exactly as the original person saw them, plus a way to check a belief of their own.
5. An unknown or expired id shows a short "This result isn't available" page with a link home.

## Sharing is deliberate, not automatic

Every check is saved, but nothing is listed, indexed or discoverable. A result is reachable only by its id, which is 16 random characters, and the pages carry `robots: noindex`. Claims are the user's own words and may be personal, so the id is unguessable rather than sequential.

## Link previews

When the link is pasted into a messaging app, the preview should say what the result is. `/r/<id>` therefore sets its title to the claim and its description to the verdict plus the first sentence of the summary.

## Architecture

- **Storage:** one JSON file per result at `data/results/<id>.json`, matching how community sign-ups are stored. Deliberate shortcut: it needs a persistent disk and is unsuitable for an ephemeral filesystem such as Vercel. Move to a database at deploy time.
- **Id:** 16 characters from a lowercase alphanumeric alphabet, generated with `crypto.randomUUID`-grade randomness. Ids are validated against that alphabet on read so a crafted id can never escape the results directory.
- **API:** `POST /api/check` gains an `id` in its response. The in-memory cache stores the id alongside the result, so re-checking the same claim returns the same link rather than writing a second copy.
- **Page reuse:** `/r/<id>` is a server component that loads the saved result and renders the existing client page with initial state, so there is one result rendering in the codebase, not two.

## Non-goals

Editing or deleting a shared result, expiry, view counts, per-network share buttons (X, Facebook), and Open Graph images. The native share sheet already covers the networks.

## Constraints

- `data/` is git-ignored and must stay that way; it holds user-written claims.
- Tests use `node:test` and `node:assert/strict` only.
- No new dependencies.
