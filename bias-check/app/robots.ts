import type { MetadataRoute } from "next";

// Shared results are private to whoever holds the link; keep crawlers out of them.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/r/", "/api/"] }] };
}
