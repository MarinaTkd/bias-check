import { NextRequest, NextResponse } from "next/server";
import { lookup, remember, type CachedResponse } from "@/lib/cache";
import { checkClaim } from "@/lib/factcheck";
import { checkAllowed } from "@/lib/limits";
import { saveResult } from "@/lib/results";
import { getStore } from "@/lib/store";

export const maxDuration = 60; // the Vercel Hobby ceiling

// Vercel sets x-forwarded-for; its last entry is the one Vercel itself observed, so a client
// cannot mint a fresh allowance by sending a header of its own.
function clientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const parts = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.at(-1) ?? "unknown";
}

const LIMIT_MESSAGE = {
  ip: "You've used your three checks for today. Come back tomorrow.",
  global: "The site has hit its daily limit. Try again tomorrow.",
  budget: "This month's research budget is spent. The site reopens next month.",
} as const;

export async function POST(req: NextRequest) {
  const store = getStore();
  const body = await req.json().catch(() => null);
  const claim = typeof body?.claim === "string" ? body.claim.trim() : "";
  if (claim.length < 3 || claim.length > 500) {
    return NextResponse.json({ error: "Claim must be 3–500 characters." }, { status: 400 });
  }

  // Cached answers cost nothing, so they are served before any limit is counted. This also
  // matches a rephrasing of something already answered, which is where most of the saving is.
  const hit = await lookup(claim, store);
  if (hit) {
    console.log(`[bias-check] cache hit${hit.matchedClaim ? " (similar claim)" : ""} claim=${JSON.stringify(claim.slice(0, 120))}`);
    return NextResponse.json({ ...hit.response, matchedClaim: hit.matchedClaim });
  }

  const allowed = await checkAllowed(clientIp(req), store);
  if (!allowed.ok) {
    console.warn(`[bias-check] refused by ${allowed.reason} limit`);
    return NextResponse.json({ error: LIMIT_MESSAGE[allowed.reason] }, { status: 429 });
  }

  try {
    const result = await checkClaim(claim);
    const id = await saveResult(claim, result, store);
    const response: CachedResponse = { ...result, id };
    await remember(claim, response, store);
    return NextResponse.json(response);
  } catch (e) {
    if (e instanceof Error && e.message === "refused") {
      console.warn(`[bias-check] refused claim=${JSON.stringify(claim.slice(0, 120))}`);
      return NextResponse.json({ error: "This claim can't be checked here." }, { status: 422 });
    }
    if (e instanceof Error && e.message === "incomplete") {
      console.warn(`[bias-check] incomplete claim=${JSON.stringify(claim.slice(0, 120))}`);
    } else {
      console.error("[bias-check] checkClaim failed", e);
    }
    return NextResponse.json({ error: "Research failed. Please try again." }, { status: 502 });
  }
}
