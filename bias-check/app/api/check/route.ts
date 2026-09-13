import { NextRequest, NextResponse } from "next/server";
import { checkClaim } from "@/lib/factcheck";

export const maxDuration = 300; // seconds; Vercel Hobby caps at 60 — lower this if deploying there

// ponytail: in-memory per-IP limiter, resets on restart and is per-instance.
// Move to Redis/Upstash when running more than one instance.
// O(IPs) sweep per request to evict expired entries; move to a TTL store with the Redis upgrade.
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(ip, recent); // drop expired timestamps for this IP
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many checks from this address. Try again in an hour." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const claim = typeof body?.claim === "string" ? body.claim.trim() : "";
  if (claim.length < 3 || claim.length > 500) {
    return NextResponse.json({ error: "Claim must be 3–500 characters." }, { status: 400 });
  }

  try {
    return NextResponse.json(await checkClaim(claim));
  } catch (e) {
    if (e instanceof Error && e.message === "refused") {
      return NextResponse.json({ error: "This claim can't be checked here." }, { status: 422 });
    }
    console.error("checkClaim failed", e);
    return NextResponse.json({ error: "Research failed. Please try again." }, { status: 502 });
  }
}
