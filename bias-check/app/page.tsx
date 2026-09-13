"use client";

import Link from "next/link";
import { useState } from "react";
import type { CheckResult, Verdict } from "@/lib/factcheck";
import { TRUSTED_DOMAINS, TRUSTED_SOURCES } from "@/lib/domains";

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

export default function Page() {
  const [claim, setClaim] = useState("");
  const [checked, setChecked] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = claim.trim().length >= 3 && !loading;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready) return;
    const text = claim.trim();
    setChecked(text);
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claim: text }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      else setResult(data);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setClaim("");
    setChecked(null);
    setResult(null);
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
            Bias Check
          </Link>
          <span className="hidden font-mono text-xs text-faint sm:inline">{TRUSTED_DOMAINS.length} trusted domains. Nothing else.</span>
        </header>

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
                  Write it the way you&rsquo;d say it. We read what trusted sources say, especially where they disagree with you.
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

                <button
                  onClick={reset}
                  className="brand-bg mt-12 rounded-full px-6 py-3 font-display text-base font-bold text-bg shadow-[0_10px_30px_-10px_rgba(245,143,124,0.45)] transition hover:scale-[1.03]"
                >
                  Check another belief
                </button>
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
