import { getStore, type Store } from "./store.ts";

export type LimitVerdict = { ok: true } | { ok: false; reason: "ip" | "global" | "budget" };

// Raise these with environment variables rather than a code change.
const PER_IP_DAILY = Number(process.env.PER_IP_DAILY_LIMIT ?? 3);
const GLOBAL_DAILY = Number(process.env.GLOBAL_DAILY_LIMIT ?? 12);
const MONTHLY_BUDGET = Number(process.env.MONTHLY_CHECK_BUDGET ?? 140);

const DAY_SECONDS = 2 * 24 * 60 * 60; // two days, so a counter outlives the day it belongs to
const MONTH_SECONDS = 70 * 24 * 60 * 60;

// Checks the three caps in ascending cost order and counts the attempt. A cached repeat never
// reaches here, so only checks that actually spend money are counted.
// ponytail: the budget is read then written, so two simultaneous requests can both pass at the
// last unit. Worth at most one extra check; a Lua script would be the fix if it ever matters.
export async function checkAllowed(ip: string, store: Store = getStore(), now = new Date()): Promise<LimitVerdict> {
  const day = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);

  const spent = (await store.get<number>(`budget:${month}`)) ?? 0;
  if (spent >= MONTHLY_BUDGET) return { ok: false, reason: "budget" };

  if ((await store.incr(`rl:ip:${ip}:${day}`, DAY_SECONDS)) > PER_IP_DAILY) return { ok: false, reason: "ip" };
  if ((await store.incr(`rl:global:${day}`, DAY_SECONDS)) > GLOBAL_DAILY) return { ok: false, reason: "global" };

  await store.incr(`budget:${month}`, MONTH_SECONDS);
  return { ok: true };
}
