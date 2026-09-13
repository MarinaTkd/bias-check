import type { Metadata } from "next";
import Link from "next/link";
import { loadResult } from "@/lib/results";
import Page from "../../page";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const saved = await loadResult((await params).id);
  // Shared results are reachable by link only; keep them out of search results.
  const robots = { index: false, follow: false };
  if (!saved) return { title: "Result not found", robots };
  const verdict = saved.result.verdict.toLowerCase();
  const firstSentence = saved.result.summary.split(/(?<=[.!?])\s/)[0] ?? "";
  // openGraph must be set explicitly: a parent layout's openGraph is not overridden by a child's
  // title alone, and openGraph is what messaging apps actually show in a link preview.
  const title = `"${saved.claim}" — ${verdict}`;
  const description = `Checked against trusted sources: ${verdict}. ${firstSentence}`.slice(0, 200);
  return { title, description, openGraph: { title, description, type: "article" }, robots };
}

export default async function SharedResult({ params }: { params: Promise<{ id: string }> }) {
  const saved = await loadResult((await params).id);

  if (!saved) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center px-5 py-24 sm:px-8">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">This result isn&rsquo;t available</h1>
        <p className="mt-3 text-lg text-muted">The link may be wrong, or the result may have been removed.</p>
        <Link
          href="/"
          className="brand-bg mt-8 rounded-full px-6 py-3 font-display text-base font-bold text-bg transition hover:scale-[1.03]"
        >
          Check a belief
        </Link>
      </main>
    );
  }

  return <Page initialClaim={saved.claim} initialResult={saved.result} initialId={saved.id} />;
}
