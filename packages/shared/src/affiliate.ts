/**
 * Outbound affiliate + UTM rewriting.
 * Destinations are always resolved server-side from DB rows; this module
 * only rewrites an already-trusted absolute URL.
 */

export type AffiliateConfig = {
  ticketmasterAffiliateId?: string | null;
  eventbriteAffiliateCode?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
};

export type AffiliateResult = {
  url: string;
  /** Matched network when an affiliate id was applied; null if UTM-only. */
  network: "ticketmaster" | "eventbrite" | null;
  host: string | null;
};

export type EventOutboundSlot = "primary" | "secondary";

export type EventOutboundFields = {
  url: string | null | undefined;
  rawPayload?: Record<string, unknown> | null | undefined;
};

function payloadString(
  payload: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const v = payload?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Primary = eventDetailsUrl || url; secondary = sourcePageUrl when distinct. */
export function resolveEventOutboundDestinations(
  event: EventOutboundFields,
): { primary: string | null; secondary: string | null } {
  const sourcePageUrl = payloadString(event.rawPayload ?? null, "sourcePageUrl");
  const eventDetailsUrl = payloadString(
    event.rawPayload ?? null,
    "eventDetailsUrl",
  );
  const primary =
    eventDetailsUrl ||
    (typeof event.url === "string" && event.url.trim()
      ? event.url.trim()
      : null);
  const secondary =
    sourcePageUrl && sourcePageUrl !== primary ? sourcePageUrl : null;
  return { primary, secondary };
}

export function resolveEventOutboundUrl(
  event: EventOutboundFields,
  slot: EventOutboundSlot = "primary",
): string | null {
  const { primary, secondary } = resolveEventOutboundDestinations(event);
  return slot === "secondary" ? secondary : primary;
}

function hostnameOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export function detectAffiliateNetwork(
  rawUrl: string,
): "ticketmaster" | "eventbrite" | null {
  const host = hostnameOf(rawUrl);
  if (!host) return null;
  if (
    /(^|\.)ticketmaster\./i.test(host) ||
    /(^|\.)livenation\./i.test(host)
  ) {
    return "ticketmaster";
  }
  if (/(^|\.)eventbrite\./i.test(host)) return "eventbrite";
  return null;
}

/**
 * Stamp UTMs and optional partner ids. Unknown hosts still get UTMs.
 * Never throws — returns the original string if URL parsing fails.
 */
export function applyAffiliateAndUtm(
  destination: string,
  config: AffiliateConfig = {},
): AffiliateResult {
  const host = hostnameOf(destination);
  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    return { url: destination, network: null, host };
  }

  const detected = detectAffiliateNetwork(destination);
  let network: AffiliateResult["network"] = null;

  if (detected === "ticketmaster" && config.ticketmasterAffiliateId?.trim()) {
    // Partner programs vary (Impact / TM affiliate); common query keys.
    if (!url.searchParams.has("affiliateId")) {
      url.searchParams.set(
        "affiliateId",
        config.ticketmasterAffiliateId.trim(),
      );
    }
    network = "ticketmaster";
  }

  if (detected === "eventbrite" && config.eventbriteAffiliateCode?.trim()) {
    if (!url.searchParams.has("aff")) {
      url.searchParams.set("aff", config.eventbriteAffiliateCode.trim());
    }
    network = "eventbrite";
  }

  const utmSource = config.utmSource?.trim() || "bored";
  const utmMedium = config.utmMedium?.trim() || "feed";
  if (!url.searchParams.has("utm_source")) {
    url.searchParams.set("utm_source", utmSource);
  }
  if (!url.searchParams.has("utm_medium")) {
    url.searchParams.set("utm_medium", utmMedium);
  }

  return { url: url.toString(), network, host };
}

export function affiliateConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): AffiliateConfig {
  return {
    ticketmasterAffiliateId: env.TICKETMASTER_AFFILIATE_ID ?? null,
    eventbriteAffiliateCode: env.EVENTBRITE_AFFILIATE_CODE ?? null,
    utmSource: env.OUTBOUND_UTM_SOURCE ?? "bored",
    utmMedium: env.OUTBOUND_UTM_MEDIUM ?? "feed",
  };
}
