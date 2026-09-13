// The allow-list handed to the web search tool, grouped for display. Edit here to change what
// counts as trustworthy. Bare hostnames only; subdomains are covered automatically; max 64.
// Note: domains that block Anthropic's crawler (e.g. reuters.com, bbc.com) make the whole
// request fail with a 400 naming them, so leave those out.
export const TRUSTED_SOURCES: { category: string; domains: string[] }[] = [
  {
    category: "Health & science agencies",
    domains: ["who.int", "cdc.gov", "nih.gov", "fda.gov", "ecdc.europa.eu", "nhs.uk", "nasa.gov", "noaa.gov", "epa.gov", "usgs.gov", "ipcc.ch", "esa.int"],
  },
  {
    category: "Peer-reviewed journals & indexes",
    domains: ["nature.com", "science.org", "thelancet.com", "nejm.org", "bmj.com", "jamanetwork.com", "cochranelibrary.com", "plos.org", "sciencedirect.com", "springer.com", "wiley.com", "cell.com", "pnas.org", "arxiv.org", "ncbi.nlm.nih.gov"],
  },
  {
    category: "Statistics & international bodies",
    domains: ["un.org", "worldbank.org", "imf.org", "oecd.org", "ourworldindata.org", "census.gov", "bls.gov", "ons.gov.uk", "eurostat.ec.europa.eu", "europa.eu"],
  },
  { category: "Reference & research institutes", domains: ["britannica.com", "pewresearch.org", "rand.org", "brookings.edu"] },
  { category: "Fact-checkers", domains: ["snopes.com", "factcheck.org", "politifact.com", "fullfact.org"] },
];

export const TRUSTED_DOMAINS: string[] = TRUSTED_SOURCES.flatMap((s) => s.domains);
