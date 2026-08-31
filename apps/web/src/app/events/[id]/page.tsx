import type { Metadata } from "next";
import { EventDetailClient } from "./EventDetailClient";
import { fetchEventForShare, shareDescription } from "@/lib/og-assets";
import { formatWhen } from "@/lib/datetime";
import { eventDetailJsonLd, jsonLdScript } from "@/lib/structured-data";
import { siteUrl } from "@/lib/site";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const event = await fetchEventForShare(id);
  if (!event) {
    return { title: "Event — Bored" };
  }

  const tz = event.timezone || "America/Los_Angeles";
  const when = formatWhen(event.startsAt, tz);
  const venue = event.venueName?.trim();
  const fallback =
    [venue, when].filter(Boolean).join(" · ") || "Something to do nearby";
  const description = shareDescription(event.description, fallback);
  const pageUrl = `${siteUrl()}/events/${id}`;

  return {
    title: `${event.title} — Bored`,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: event.title,
      description,
      type: "website",
      siteName: "Bored",
      url: pageUrl,
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description,
    },
  };
}

export default async function EventDetailPage({ params }: Props) {
  const { id } = await params;
  const event = await fetchEventForShare(id);
  const pageUrl = `${siteUrl()}/events/${id}`;

  return (
    <>
      {event ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(eventDetailJsonLd(event, pageUrl)),
          }}
        />
      ) : null}
      <EventDetailClient id={id} />
    </>
  );
}
