import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy — Check Your Bias" };

export default function Privacy() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-16 sm:px-8">
      <Link href="/" className="font-mono text-xs uppercase tracking-[0.14em] text-muted hover:text-fg">
        ← Check Your Bias
      </Link>
      <h1 className="mt-8 font-display text-4xl font-extrabold tracking-tight">Privacy</h1>

      <h2 className="mt-10 font-display text-xl font-bold">Beliefs you check</h2>
      <p className="mt-2 leading-relaxed text-muted">
        The text you type is sent to Anthropic&rsquo;s API to be researched, and the result is stored so it can be
        shared by link. Stored results are not listed anywhere and are reachable only by their random link, which you
        choose whether to share. Do not type anything you would not want a person you send the link to reading.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Joining the community</h2>
      <p className="mt-2 leading-relaxed text-muted">
        If you join, we store your email address, gender, age range and ethnicity, and the time you consented. The
        email is used only to tell you when the community opens. The other three are used only to group answers, so a
        question can show how different groups responded, never to identify you. Every one of them has a
        &ldquo;Prefer not to say&rdquo; option, and nothing is shared with anyone else or used for advertising.
      </p>
      <p className="mt-2 leading-relaxed text-muted">
        The legal basis is your consent, which you give by ticking the box on the form. You can withdraw it at any
        time, and ask for a copy of what is held or for it to be deleted, by emailing the address below. Sign-ups are
        kept until the community launches and you decide whether to stay, or until you ask for deletion.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Contact</h2>
      <p className="mt-2 leading-relaxed text-muted">
        Email <span className="font-mono">helen-baranova@seznam.cz</span> for access or deletion requests.
      </p>
    </main>
  );
}
