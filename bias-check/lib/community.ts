// Community sign-up: the fields we collect and their allowed values. Shared by the form and the API.
export const GENDERS = ["Woman", "Man", "Non-binary", "Another gender", "Prefer not to say"] as const;
export const AGE_RANGES = ["Under 18", "18–24", "25–34", "35–44", "45–54", "55–64", "65+"] as const;
export const ETHNICITIES = [
  "Asian",
  "Black or African descent",
  "Hispanic or Latino",
  "Indigenous",
  "Middle Eastern or North African",
  "White",
  "Mixed or multiple",
  "Another background",
  "Prefer not to say",
] as const;

export type Member = {
  email: string;
  gender: (typeof GENDERS)[number];
  ageRange: (typeof AGE_RANGES)[number];
  ethnicity: (typeof ETHNICITIES)[number];
};

// Returns a clean Member or null if any field is missing or not one of the allowed values.
export function parseMember(body: unknown): Member | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  const pick = <T extends readonly string[]>(v: unknown, allowed: T): T[number] | null =>
    typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T[number]) : null;
  const gender = pick(b.gender, GENDERS);
  const ageRange = pick(b.ageRange, AGE_RANGES);
  const ethnicity = pick(b.ethnicity, ETHNICITIES);
  if (!gender || !ageRange || !ethnicity) return null;
  return { email, gender, ageRange, ethnicity };
}
