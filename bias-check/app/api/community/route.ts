import { appendFile, mkdir } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { parseMember } from "@/lib/community";

// ponytail: sign-ups append to a local JSONL file; fine for one instance with a persistent disk.
// Move to a database before deploying anywhere with an ephemeral filesystem (e.g. Vercel).
const FILE = "data/community.jsonl";

export async function POST(req: NextRequest) {
  const member = parseMember(await req.json().catch(() => null));
  if (!member) {
    return NextResponse.json({ error: "Fill in every field with one of the offered options." }, { status: 400 });
  }
  await mkdir("data", { recursive: true });
  await appendFile(FILE, JSON.stringify({ ...member, joinedAt: new Date().toISOString() }) + "\n");
  console.log("[bias-check] community join"); // no personal data in logs
  return NextResponse.json({ ok: true });
}
