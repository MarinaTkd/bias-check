import { NextRequest, NextResponse } from "next/server";
import { parseMember } from "@/lib/community";
import { getStore } from "@/lib/store";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const member = parseMember(body);
  if (!member) {
    return NextResponse.json({ error: "Fill in every field with one of the offered options." }, { status: 400 });
  }
  // Ethnicity is special category data under GDPR, so consent is explicit and recorded.
  if (body?.consent !== true) {
    return NextResponse.json({ error: "Tick the consent box to join." }, { status: 400 });
  }
  await getStore().push("community", { ...member, consentedAt: new Date().toISOString() });
  console.log("[bias-check] community join"); // no personal data in logs
  return NextResponse.json({ ok: true });
}
