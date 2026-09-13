"use client";

import { Fragment, useState } from "react";
import type { CheckResult, Verdict } from "@/lib/factcheck";
import { TRUSTED_DOMAINS, TRUSTED_SOURCES } from "@/lib/domains";

// How the pen marks the claim for each verdict: the colour token and the gesture.
const MARK: Record<Verdict, { color: string; gesture: string }> = {
  FALSE: { color: "var(--v-false)", gesture: "" },
  "MOSTLY FALSE": { color: "var(--v-mostly-false)", gesture: "" },
  MIXED: { color: "var(--v-mixed)", gesture: "mark--wavy" },
  "MOSTLY TRUE": { color: "var(--v-mostly-true)", gesture: "mark--under" },
  TRUE: { color: "var(--v-true)", gesture: "mark--under" },
  UNVERIFIABLE: { color: "var(--v-unverifiable)", gesture: "mark--dotted" },
};

const PLACEHOLDER = "coffee stunts your growth.";

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function Page() {
  const [claim, setClaim] = useState("");
  const [checked, setChecked] = useState<string | null>(null); // the claim as submitted
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

  const mark = result ? MARK[result.verdict] : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 pb-24 pt-14 sm:px-10 sm:pt-20">
      <header className="flex items-baseline justify-between font-mono text-xs uppercase tracking-[0.18em] text-ink-soft">
        <span className="text-pen">Bias check</span>
        <span className="hidden sm:inline">Your belief, read against the evidence</span>
      </header>

      {/* The claim: a sentence you complete, and later the sentence the evidence marks up. */}
      <section className="mt-16 font-display text-[2rem] leading-[1.15] sm:text-[2.75rem]">
        <span className="italic text-ink-soft">I believe that </span>
        {checked === null ? (
          <form onSubmit={submit} className="inline">
            <label htmlFor="claim" className="sr-only">
              Your belief
            </label>
            <textarea
              id="claim"
              autoFocus
              rows={1}
              maxLength={500}
              value={claim}
              placeholder={PLACEHOLDER}
              onChange={(e) => setClaim(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="block w-full resize-none border-0 border-b-2 border-rule bg-transparent p-0 pb-1 font-display text-ink placeholder:text-ink-faint caret-pen focus:border-pen focus:outline-none [field-sizing:content]"
            />
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 font-mono text-xs text-ink-soft">
              <span aria-live="polite">
                {claim.length > 0 ? `${claim.length} / 500` : "Enter to check · Shift+Enter for a new line"}
              </span>
              <button
                type="submit"
                disabled={!ready}
                className="rounded-sm bg-pen px-4 py-2 uppercase tracking-[0.14em] text-paper transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                Check this belief
              </button>
            </div>
          </form>
        ) : (
          <>
            <span
              className={mark ? `mark ${mark.gesture}` : ""}
              style={mark ? ({ "--v": mark.color } as React.CSSProperties) : undefined}
            >
              {checked}
            </span>
            {result && mark && (
              <span
                className="stamp ml-3 inline-block -translate-y-1 rounded-sm border-[1.5px] px-2 py-0.5 align-middle font-mono text-xs font-medium uppercase tracking-[0.14em]"
                style={{ borderColor: mark.color, color: mark.color }}
              >
                {result.verdict}
              </span>
            )}
          </>
        )}
      </section>

      {loading && (
        <aside className="mt-8 max-w-[38rem]" aria-busy="true">
          <div className="rule-pulse h-0.5 w-full bg-pen" />
          <p className="mt-6 font-mono text-xs uppercase tracking-[0.14em] text-ink-soft">
            <span className="ellipsis">Reading trusted sources</span>
            <span className="ml-3 normal-case tracking-normal text-ink-faint">typically 10 to 20 seconds</span>
          </p>
          {/* Fill the wait with the trust model: exactly what is being searched, and nothing else. */}
          <dl className="mt-5 grid gap-y-3 text-sm leading-relaxed sm:grid-cols-[12rem_1fr] sm:gap-x-6">
            {TRUSTED_SOURCES.map((g) => (
              <Fragment key={g.category}>
                <dt className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-ink-soft sm:pt-0.5">{g.category}</dt>
                <dd className="text-ink-soft">{g.domains.join(" · ")}</dd>
              </Fragment>
            ))}
          </dl>
          <p className="mt-5 font-mono text-xs text-ink-faint">{TRUSTED_DOMAINS.length} domains. Nothing outside this list is searched.</p>
        </aside>
      )}

      {error && (
        <div role="alert" className="mt-10 border-l-2 border-pen pl-4">
          <p className="text-lg">{error}</p>
          <button onClick={reset} className="mt-3 font-mono text-xs uppercase tracking-[0.14em] text-ink-soft underline-offset-4 hover:underline">
            Try another belief
          </button>
        </div>
      )}

      <section aria-live="polite">
        {result && (
          <>
            <h2 className="mt-14 font-mono text-xs uppercase tracking-[0.18em] text-ink-soft">What the evidence says</h2>
            <div className="mt-4 max-w-[38rem] whitespace-pre-wrap text-[1.15rem] leading-[1.65]">
              {result.segments.map((seg, i) => (
                <span key={i}>
                  {seg.text}
                  {seg.refs.map((n) => (
                    <sup key={n} className="ml-px font-mono text-[0.68em] leading-none">
                      <a
                        href={`#src-${n}`}
                        title={result.sources[n - 1]?.title}
                        className="rounded-xs px-px text-pen no-underline hover:bg-highlight"
                      >
                        [{n}]
                      </a>
                    </sup>
                  ))}
                </span>
              ))}
            </div>

            {result.sources.length > 0 && (
              <>
                <h2 className="mt-14 flex items-baseline gap-3 font-mono text-xs uppercase tracking-[0.18em] text-ink-soft">
                  Sources
                  <span className="text-ink-faint">{result.sources.length}</span>
                </h2>
                <ol className="mt-4 divide-y divide-rule">
                  {result.sources.map((s, i) => (
                    <li
                      key={s.url}
                      id={`src-${i + 1}`}
                      className="grid scroll-mt-6 grid-cols-[2.5rem_1fr] gap-x-2 py-4 transition-colors target:bg-highlight"
                    >
                      <span className="font-mono text-sm text-pen">[{i + 1}]</span>
                      <div className="min-w-0">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium underline decoration-rule decoration-1 underline-offset-4 hover:decoration-ink"
                        >
                          {s.title}
                        </a>
                        <span className="ml-2 font-mono text-xs text-ink-faint">{hostOf(s.url)}</span>
                        {s.quote && <p className="mt-1.5 text-[0.95rem] italic leading-relaxed text-ink-soft">&ldquo;{s.quote}&rdquo;</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}

            <button onClick={reset} className="mt-14 font-mono text-xs uppercase tracking-[0.14em] text-ink-soft underline-offset-4 hover:underline">
              Check another belief
            </button>
          </>
        )}
      </section>

      <footer className="mt-24 max-w-[38rem] border-t border-rule pt-5 text-sm leading-relaxed text-ink-soft">
        Only peer-reviewed journals, public health and science agencies, statistics offices, reference works and
        established fact-checkers are searched. The summary leans toward the evidence against your belief on purpose;
        when the evidence supports it, it says so.
      </footer>
    </main>
  );
}
