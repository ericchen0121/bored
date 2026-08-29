/** Public origin for absolute OG/canonical URLs. */
export function siteUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.WEB_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return `https://${railway.replace(/\/$/, "")}`;

  return "http://127.0.0.1:3000";
}

export function apiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.trim() || "http://127.0.0.1:4000"
  ).replace(/\/$/, "");
}
