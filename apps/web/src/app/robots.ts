import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Major AI / search crawlers — allow public content for AEO discovery. */
const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "Googlebot",
  "Bingbot",
  "Applebot-Extended",
] as const;

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  const disallow = ["/admin/", "/onboarding/", "/auth/", "/saved", "/account"];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow,
      })),
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
