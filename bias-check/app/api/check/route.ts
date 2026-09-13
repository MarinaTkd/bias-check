import { NextRequest, NextResponse } from "next/server";
import { checkClaim, type CheckResult } from "@/lib/factcheck";
import { saveResult } from "@/lib/results";

export const maxDuration = 300; // seconds; Vercel Hobby caps at 60 — lower this if deploying there

// ponytail: in-memory per-IP limiter, resets on restart and is per-instance.
// Move to Redis/Upstash when running more than one instance.
// O(IPs) sweep per request to evict expired entries; move to a TTL store with the Redis upgrade.
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 5;
const hits = new Map<string, number[]>();

// ponytail: single-instance global cap; move with the Redis upgrade.
const GLOBAL_LIMIT = 60;
let globalHits: number[] = [];

function rateLimited(ip: string): boolean {
  const now = Date.now();
  for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  globalHits = globalHits.filter((t) => now - t < WINDOW_MS);

  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT || globalHits.length >= GLOBAL_LIMIT) {
    hits.set(ip, recent); // drop expired timestamps for this IP
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  globalHits.push(now);
  return false;
}

// ponytail: in-memory result cache so repeated claims cost nothing; per-instance, lost on
// restart. Move to a shared store alongside the rate limiter.
const CACHE_MAX = 500;
type CheckResponse = CheckResult & { id: string };
const cache = new Map<string, CheckResponse>();
function cacheKey(claim: string) {
  return claim.toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();
}

function clientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    console.warn(`[bias-check] rate limited ip=${ip}`);
    return NextResponse.json({ error: "Too many checks from this address. Try again in an hour." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const claim = typeof body?.claim === "string" ? body.claim.trim() : "";
  if (claim.length < 3 || claim.length > 500) {
    return NextResponse.json({ error: "Claim must be 3–500 characters." }, { status: 400 });
  }

  const key = cacheKey(claim);
  const hit = cache.get(key);
  if (hit) {
    console.log(`[bias-check] cache hit claim=${JSON.stringify(claim.slice(0, 120))}`);
    return NextResponse.json(hit);
  }

  try {
    const result = await checkClaim(claim);
    const id = await saveResult(claim, result);
    const response: CheckResponse = { ...result, id };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, response);
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
