import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center px-5 py-24 sm:px-8">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Nothing here</h1>
      <p className="mt-3 text-lg text-muted">That address doesn&rsquo;t match a page on this site.</p>
      <Link
        href="/"
        className="brand-bg mt-8 rounded-full px-6 py-3 font-display text-base font-bold text-bg transition hover:scale-[1.03]"
      >
        Check a belief
      </Link>
    </main>
  );
}
