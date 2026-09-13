export type Verdict = "FALSE" | "MOSTLY FALSE" | "MIXED" | "MOSTLY TRUE" | "TRUE" | "UNVERIFIABLE";
export type Source = { url: string; title: string; quote: string };
export type CheckResult = { verdict: Verdict; summary: string; sources: Source[] };

const VERDICTS: Verdict[] = ["FALSE", "MOSTLY FALSE", "MIXED", "MOSTLY TRUE", "TRUE", "UNVERIFIABLE"];

// Edit this list to change what counts as trustworthy. Subdomains are covered automatically.
export const TRUSTED_DOMAINS: string[] = [
  // Health & science agencies
  "who.int", "cdc.gov", "nih.gov", "fda.gov", "ecdc.europa.eu", "nhs.uk",
  "nasa.gov", "noaa.gov", "epa.gov", "usgs.gov", "ipcc.ch", "esa.int",
  // Peer-reviewed publishers & indexes
  "nature.com", "science.org", "thelancet.com", "nejm.org", "bmj.com", "jamanetwork.com",
  "cochranelibrary.com", "plos.org", "sciencedirect.com", "springer.com", "wiley.com",
  "cell.com", "pnas.org", "arxiv.org", "ncbi.nlm.nih.gov",
  // Statistics & international bodies
  "un.org", "worldbank.org", "imf.org", "oecd.org", "ourworldindata.org",
  "census.gov", "bls.gov", "ons.gov.uk", "eurostat.ec.europa.eu", "europa.eu",
  // Reference & research institutions
  "britannica.com", "pewresearch.org", "rand.org", "brookings.edu",
  // Wire services & public broadcasters
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk",
  // Fact-checkers
  "snopes.com", "factcheck.org", "politifact.com", "fullfact.org",
];

export function parseVerdict(text: string): { verdict: Verdict; summary: string } {
  const m = text.match(/^\s*verdict:\s*([a-z ]+?)\s*\n/i);
  if (!m) return { verdict: "UNVERIFIABLE", summary: text.trim() };
  const word = m[1].trim().toUpperCase().replace(/\s+/g, " ");
  const verdict = (VERDICTS as string[]).includes(word) ? (word as Verdict) : "UNVERIFIABLE";
  return { verdict, summary: text.slice(m[0].length).trim() };
}

type CitationLike = { type: string; url?: string; title?: string | null; cited_text?: string };
type ContentLike = { type: string; citations?: CitationLike[] | null };

export function extractSources(blocks: ContentLike[]): Source[] {
  const byUrl = new Map<string, Source>();
  for (const b of blocks) {
    if (b.type !== "text" || !b.citations) continue;
    for (const c of b.citations) {
      if (c.type !== "web_search_result_location" || !c.url || byUrl.has(c.url)) continue;
      byUrl.set(c.url, { url: c.url, title: c.title || c.url, quote: c.cited_text ?? "" });
    }
  }
  return [...byUrl.values()];
}
