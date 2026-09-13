import { checkClaim } from "./factcheck.ts";

const claim = process.argv.slice(2).join(" ") || "Humans only use 10% of their brains.";
console.log("Claim:", claim);
const r = await checkClaim(claim);
console.log("\nVERDICT:", r.verdict);
console.log("\n" + r.segments.map((s) => s.text + s.refs.map((n) => `[${n}]`).join("")).join(""));
console.log("\nSources:");
for (const s of r.sources) console.log(`- ${s.title}\n  ${s.url}\n  "${s.quote.slice(0, 120)}"`);
