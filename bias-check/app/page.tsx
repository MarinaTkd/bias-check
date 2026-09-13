"use client";

import { useState } from "react";
import type { CheckResult, Verdict } from "@/lib/factcheck";

const VERDICT_STYLE: Record<Verdict, string> = {
  FALSE: "bg-red-600 text-white",
  "MOSTLY FALSE": "bg-orange-500 text-white",
  MIXED: "bg-yellow-400 text-black",
  "MOSTLY TRUE": "bg-lime-500 text-black",
  TRUE: "bg-green-600 text-white",
  UNVERIFIABLE: "bg-gray-500 text-white",
};

export default function Page() {
  const [claim, setClaim] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claim }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      else setResult(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 font-sans">
      <h1 className="text-3xl font-bold">Bias Check</h1>
      <p className="mt-2 text-gray-600">
        Type something you believe. We look only at trustworthy sources and show you what they say, especially where they disagree with you.
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <textarea
          className="w-full rounded border border-gray-300 p-3"
          rows={3}
          maxLength={500}
          required
          minLength={3}
          placeholder="e.g. Humans only use 10% of their brains."
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          disabled={loading}
        />
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{claim.length}/500</span>
          <button
            type="submit"
            disabled={loading || claim.trim().length < 3}
            className="rounded bg-black px-4 py-2 font-medium text-white disabled:opacity-40"
          >
            {loading ? "Researching… (up to a minute)" : "Check it"}
          </button>
        </div>
      </form>

      {error && <p role="alert" className="mt-6 rounded bg-red-50 p-3 text-red-800">{error}</p>}

      <section className="mt-8" aria-live="polite">
        {result && (
          <>
            <span className={`inline-block rounded px-3 py-1 text-sm font-bold ${VERDICT_STYLE[result.verdict]}`}>
              {result.verdict}
            </span>
            <div className="mt-4 whitespace-pre-wrap leading-relaxed">
              {result.segments.map((seg, i) => (
                <span key={i}>
                  {seg.text}
                  {seg.refs.map((n) => (
                    <sup key={n} className="ml-0.5 text-xs">
                      <a href={`#src-${n}`} className="text-blue-700 no-underline hover:underline" title={result.sources[n - 1]?.title}>
                        [{n}]
                      </a>
                    </sup>
                  ))}
                </span>
              ))}
            </div>

            {result.sources.length > 0 && (
              <>
                <h2 className="mt-8 text-xl font-semibold">Sources</h2>
                <ol className="mt-3 list-decimal space-y-4 pl-5">
                  {result.sources.map((s, i) => (
                    <li key={s.url} id={`src-${i + 1}`} className="scroll-mt-4 target:bg-yellow-50">
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                        {s.title}
                      </a>
                      {s.quote && <blockquote className="mt-1 border-l-2 pl-3 text-sm text-gray-600">&ldquo;{s.quote}&rdquo;</blockquote>}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
