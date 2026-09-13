"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { CheckResult, Verdict } from "@/lib/factcheck";
import { TRUSTED_DOMAINS, TRUSTED_SOURCES } from "@/lib/domains";
import { AGE_RANGES, ETHNICITIES, GENDERS } from "@/lib/community";

// One colour and one pen gesture per verdict.
const VERDICT: Record<Verdict, { color: string; gesture: string; label: string }> = {
  FALSE: { color: "var(--v-false)", gesture: "", label: "False" },
  "MOSTLY FALSE": { color: "var(--v-mostly-false)", gesture: "", label: "Mostly false" },
  MIXED: { color: "var(--v-mixed)", gesture: "mark--wavy", label: "Mixed" },
  "MOSTLY TRUE": { color: "var(--v-mostly-true)", gesture: "mark--under", label: "Mostly true" },
  TRUE: { color: "var(--v-true)", gesture: "mark--under", label: "True" },
  UNVERIFIABLE: { color: "var(--v-unverifiable)", gesture: "mark--dotted", label: "Unverifiable" },
};

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function Page({
  initialClaim,
  initialResult,
  initialId,
}: {
  initialClaim?: string;
  initialResult?: CheckResult;
  initialId?: string;
} = {}) {
  const [claim, setClaim] = useState("");
  const [checked, setChecked] = useState<string | null>(initialClaim ?? null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(initialResult ?? null);
  const [error, setError] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(initialId ?? null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null); // shown only when copying fails
  const domainsDialog = useRef<HTMLDialogElement>(null);
  const communityDialog = useRef<HTMLDialogElement>(null);
  const [joinState, setJoinState] = useState<"idle" | "sending" | "joined" | { error: string }>("idle");

  const ready = claim.trim().length >= 3 && !loading;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready) return;
    const text = claim.trim();
    setChecked(text);
    setLoading(true);
    setResult(null);
    setResultId(null);
    setError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claim: text }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      else {
        setResult(data);
        setResultId(typeof data.id === "string" ? data.id : null);
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function join(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setJoinState("sending");
    const form = new FormData(e.currentTarget);
    const data = { ...Object.fromEntries(form), consent: form.get("consent") === "on" };
    try {
      const res = await fetch("/api/community", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) setJoinState("joined");
      else setJoinState({ error: (await res.json()).error ?? "Couldn't join. Try again." });
    } catch {
      setJoinState({ error: "Couldn't reach the server. Try again." });
    }
  }

  // The device's own share sheet where it exists, clipboard everywhere else.
  async function share() {
    if (!resultId) return;
    const url = `${window.location.origin}/r/${resultId}`;
    const text = result ? `"${checked}" — ${VERDICT[result.verdict].label}` : (checked ?? "");
    try {
      if (navigator.share) {
        await navigator.share({ title: "Check Your Bias", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied");
      setTimeout(() => setShareNote(null), 2000);
    } catch {
      // A cancelled share sheet throws AbortError, so say nothing there. A blocked clipboard
      // (no permission, or a page served over plain http) would otherwise be a dead end, so
      // show the link for the person to copy by hand.
      if (!navigator.share) setShareUrl(url);
    }
  }

  function reset() {
    setClaim("");
    setChecked(null);
    setResult(null);
    setResultId(null);
    setShareNote(null);
    setShareUrl(null);
    setError(null);
  }

  const v = result ? VERDICT[result.verdict] : null;

  return (
    <main
      className={`flex-1 px-5 pb-24 pt-6 sm:px-8 ${v ? "verdict-page" : ""}`}
      style={v ? ({ "--v": v.color } as React.CSSProperties) : undefined}
    >
      <div className="aurora" aria-hidden>
        <i />
      </div>
      <div className="mx-auto w-full max-w-3xl">
        <header className="glass flex items-center justify-between rounded-full py-2 pl-3 pr-5">
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
            <span className="brand-bg grid size-7 place-items-center rounded-full text-bg" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7.5l3 3 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            Check Your Bias
          </Link>
          <span className="font-mono text-xs text-faint">
            <button
              type="button"
              onClick={() => domainsDialog.current?.showModal()}
              className="underline decoration-dotted underline-offset-4 transition hover:text-fg"
            >
              {TRUSTED_DOMAINS.length} trusted domains
            </button>
            <span className="hidden sm:inline">. Nothing else.</span>
          </span>
        </header>

        <dialog
          ref={domainsDialog}
          onClick={(e) => e.target === e.currentTarget && domainsDialog.current?.close()}
          className="glass m-auto w-[min(42rem,calc(100vw-2rem))] rounded-3xl p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
        >
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight">Where the evidence comes from</h2>
                <p className="mt-1 text-sm text-muted">
                  Searches are restricted to these {TRUSTED_DOMAINS.length} domains at the API level. Nothing outside this list is read.
                </p>
              </div>
              <button
                type="button"
                onClick={() => domainsDialog.current?.close()}
                aria-label="Close"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-bg-2/60 text-muted transition hover:text-fg"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {TRUSTED_SOURCES.map((g) => (
                <section key={g.category}>
                  <h3 className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-faint">{g.category}</h3>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {g.domains.map((d) => (
                      <li key={d}>
                        <a
                          href={`https://${d}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block rounded-full border border-line bg-bg-2/50 px-2.5 py-1 font-mono text-xs text-muted transition hover:border-coral hover:text-fg"
                        >
                          {d}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </dialog>

        <dialog
          ref={communityDialog}
          onClick={(e) => e.target === e.currentTarget && communityDialog.current?.close()}
          className="glass m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto rounded-3xl p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
        >
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display text-2xl font-bold tracking-tight">Ask the community</h2>
              <button
                type="button"
                onClick={() => communityDialog.current?.close()}
                aria-label="Close"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-bg-2/60 text-muted transition hover:text-fg"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">
              Some beliefs can&rsquo;t be settled by sources. For those, we&rsquo;re building a community. Once it&rsquo;s large
              enough, you&rsquo;ll be able to post your question, members will be notified and share their point of view, and
              their answers will come back to you.
            </p>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">
              There aren&rsquo;t enough members yet. Join now and we&rsquo;ll let you know when it opens.
            </p>

            {joinState === "joined" ? (
              <p className="mt-6 rounded-2xl bg-bg-2/60 p-4 text-[0.95rem]">
                You&rsquo;re in. We&rsquo;ll email you when the community opens.
              </p>
            ) : (
              <form onSubmit={join} className="mt-6 grid gap-4">
                <label className="grid gap-1.5 text-sm">
                  <span className="text-muted">Email</span>
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="brand-ring rounded-xl border border-line bg-bg-2/50 px-3 py-2.5 text-fg placeholder:text-faint focus:outline-none"
                  />
                </label>
                <p className="text-xs leading-relaxed text-faint">
                  We ask the next three so answers can be shown by group, never by person. Pick &ldquo;Prefer not to say&rdquo; for any of them.
                </p>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  {(
                    [
                      ["gender", "Gender", GENDERS],
                      ["ageRange", "Age range", AGE_RANGES],
                      ["ethnicity", "Ethnicity", ETHNICITIES],
                    ] as const
                  ).map(([name, label, options]) => (
                    <label key={name} className="grid min-w-0 gap-1.5 text-sm">
                      <span className="text-muted">{label}</span>
                      <select
                        name={name}
                        required
                        defaultValue=""
                        className="brand-ring w-full min-w-0 rounded-xl border border-line bg-bg-2/50 px-3 py-2.5 text-fg focus:outline-none"
                      >
                        <option value="" disabled>
                          Choose
                        </option>
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {typeof joinState === "object" && (
                  <p role="alert" className="text-sm text-[var(--v-false)]">
                    {joinState.error}
                  </p>
                )}
                <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted">
                  <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0 accent-[var(--coral)]" />
                  <span>
                    I agree to Check Your Bias storing my email and the answers above, so it can tell me when the
                    community opens and group answers by demographic. I can ask for them to be deleted at any time.{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      Privacy notice
                    </a>
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={joinState === "sending"}
                  className="brand-bg mt-1 justify-self-start rounded-full px-6 py-3 font-display text-base font-bold text-bg transition hover:scale-[1.03] disabled:opacity-40"
                >
                  {joinState === "sending" ? "Joining…" : "Join the community"}
                </button>
              </form>
            )}
          </div>
        </dialog>

        {checked === null ? (
          <form onSubmit={submit} className="mt-20 sm:mt-28">
            <div className="flex items-start justify-between gap-8">
              <div>
                <label htmlFor="claim" className="block font-display text-5xl leading-[0.98] tracking-[-0.025em] sm:text-7xl">
                  <span className="font-medium text-muted">What do you</span>
                  <br />
                  <span className="brand-text font-extrabold">believe?</span>
                </label>
                <p className="mt-5 max-w-md text-lg text-muted/80">
                  Type a belief. Read the evidence.
                </p>
              </div>
              {/* Müller-Lyer illusion: both lines are the same length. Perception, not measurement. */}
              <svg
                className="hidden w-44 shrink-0 sm:block"
                viewBox="0 0 176 176"
                aria-label="Two lines of equal length that appear different because of the arrowheads on their ends"
                role="img"
              >
                <defs>
                  <linearGradient id="coral" gradientUnits="userSpaceOnUse" x1="28" y1="0" x2="148" y2="0">
                    <stop offset="0" stopColor="#f58f7c" />
                    <stop offset="1" stopColor="#f2c4ce" />
                  </linearGradient>
                </defs>
                <circle cx="88" cy="88" r="54" fill="none" stroke="var(--line)" />
                <circle cx="88" cy="88" r="38" fill="none" stroke="var(--line)" />
                <g stroke="url(#coral)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none">
                  <path d="M40 62h96" />
                  <path d="M52 50 40 62l12 12M124 50l12 12-12 12" />
                  <path d="M40 114h96" />
                  <path d="M28 102l12 12-12 12M148 102l-12 12 12 12" />
                </g>
              </svg>
            </div>
            <textarea
              id="claim"
              autoFocus
              rows={2}
              maxLength={500}
              value={claim}
              placeholder="Coffee stunts your growth."
              onChange={(e) => setClaim(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="glass brand-ring mt-8 block w-full resize-none rounded-2xl p-5 font-display text-2xl font-medium leading-snug tracking-tight transition text-fg placeholder:text-faint focus:outline-none sm:text-3xl [field-sizing:content]"
            />
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={!ready}
                className="brand-bg rounded-full px-6 py-3 font-display text-base font-bold text-bg shadow-[0_10px_30px_-10px_rgba(245,143,124,0.45)] transition hover:scale-[1.03] hover:shadow-[0_14px_36px_-10px_rgba(245,143,124,0.6)] disabled:opacity-30 disabled:shadow-none disabled:hover:scale-100"
              >
                Check it &rarr;
              </button>
              <span className="font-mono text-xs text-muted" aria-live="polite">
                {claim.length > 0 ? `${claim.length} / 500` : "Enter to check"}
              </span>
            </div>
          </form>
        ) : (
          <section className="mt-10 sm:mt-14" aria-live="polite">
            {/* The verdict block: colour when the answer lands, grey while reading. */}
            <div
              className={`rise overflow-hidden rounded-3xl p-6 sm:p-9 ${v ? "verdict text-white" : "glass"}`}
            >
              <p className={`font-mono text-xs uppercase tracking-[0.16em] ${v ? "text-white/70" : "text-muted"}`}>
                {loading ? <span className="ellipsis">Reading trusted sources</span> : error ? "Couldn't check" : "Verdict"}
              </p>
              {v && (
                <p className="mt-2 font-display text-6xl font-extrabold leading-none tracking-[-0.04em] sm:text-8xl">{v.label}</p>
              )}
              {loading && <div className="shimmer mt-3 h-14 w-2/3 rounded-xl sm:h-20" aria-hidden />}
              <p className={`mt-6 font-display text-xl font-medium leading-snug tracking-tight sm:text-2xl ${v ? "" : "text-fg"}`}>
                <span className={`${v ? `mark ${v.gesture}` : ""}`}>{checked}</span>
              </p>
            </div>

            {loading && (
              <aside className="mt-8" aria-busy="true">
                <p className="text-sm text-muted">
                  Typically 10 to 20 seconds. Only these sources are searched:
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {TRUSTED_SOURCES.flatMap((g) => g.domains).map((d) => (
                    <span key={d} className="glass rounded-full px-2.5 py-1 font-mono text-[0.7rem] text-muted">
                      {d}
                    </span>
                  ))}
                </div>
              </aside>
            )}

            {error && (
              <div role="alert" className="mt-8">
                <p className="text-lg">{error}</p>
                <button onClick={reset} className="brand-bg mt-3 rounded-full px-5 py-2 font-display text-sm font-bold text-bg">
                  Try another belief
                </button>
              </div>
            )}

            {result && (
              <>
                <div className="rise mt-10 max-w-[40rem] whitespace-pre-wrap text-[1.125rem] leading-[1.6]" style={{ animationDelay: "200ms" }}>
                  {result.segments.map((seg, i) => (
                    <span key={i}>
                      {seg.text}
                      {seg.refs.map((n) => (
                        <a
                          key={n}
                          href={`#src-${n}`}
                          title={result.sources[n - 1]?.title}
                          className="mx-0.5 inline-block -translate-y-1.5 rounded-md px-1.5 font-mono text-[0.66rem] font-medium leading-[1.5] text-white"
                          style={{ background: v?.color }}
                        >
                          {n}
                        </a>
                      ))}
                    </span>
                  ))}
                </div>

                {result.verdict === "UNVERIFIABLE" && (
                  <div className="glass rise mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5" style={{ animationDelay: "300ms" }}>
                    <p className="max-w-sm text-[0.95rem] leading-relaxed text-muted">
                      Trusted sources can&rsquo;t settle this one. People might.
                    </p>
                    <button
                      type="button"
                      onClick={() => communityDialog.current?.showModal()}
                      className="brand-bg rounded-full px-5 py-2.5 font-display text-sm font-bold text-bg transition hover:scale-[1.03]"
                    >
                      Ask the community
                    </button>
                  </div>
                )}

                {result.sources.length > 0 && (
                  <section className="rise mt-12" style={{ animationDelay: "350ms" }}>
                    <h2 className="font-display text-2xl font-bold tracking-tight">
                      Sources <span className="text-faint">{result.sources.length}</span>
                    </h2>
                    <ol className="mt-4 grid gap-3 sm:grid-cols-2">
                      {result.sources.map((s, i) => (
                        <li
                          key={s.url}
                          id={`src-${i + 1}`}
                          className="glass scroll-mt-6 rounded-2xl p-4 transition hover:-translate-y-0.5 target:shadow-[0_0_0_3px_var(--v)]"
                        >
                          <div className="flex items-center gap-2 font-mono text-xs text-muted">
                            <span
                              className="grid size-5 shrink-0 place-items-center rounded-md text-[0.66rem] font-medium text-white"
                              style={{ background: v?.color }}
                            >
                              {i + 1}
                            </span>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${hostOf(s.url)}&sz=32`}
                              alt=""
                              width={16}
                              height={16}
                              className="rounded-sm"
                            />
                            <span className="truncate">{hostOf(s.url)}</span>
                          </div>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 block font-display text-[1.05rem] font-semibold leading-snug tracking-tight hover:underline"
                          >
                            {s.title}
                          </a>
                          {s.quote && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">&ldquo;{s.quote}&rdquo;</p>}
                        </li>
                      ))}
                    </ol>
                  </section>
                )}

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
                  {shareUrl && (
                    <label className="flex w-full items-center gap-2 text-xs text-muted">
                      <span className="shrink-0">Copy this link:</span>
                      <input
                        readOnly
                        value={shareUrl}
                        ref={(el) => el?.select()}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 rounded-lg border border-line bg-bg-2/50 px-2 py-1 font-mono text-xs text-fg"
                      />
                    </label>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        <footer className="mt-24 max-w-[40rem] border-t border-line pt-5 text-sm leading-relaxed text-muted">
          Only peer-reviewed journals, public health and science agencies, statistics offices, reference works and
          established fact-checkers are searched. The summary leans toward the evidence against your belief on purpose;
          when the evidence supports it, it says so.
        </footer>
      </div>
    </main>
  );
}
