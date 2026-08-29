import type { Metadata } from "next";
import { EventDetailClient } from "./EventDetailClient";
import { fetchEventForShare, shareDescription } from "@/lib/og-assets";
import { formatWhen } from "@/lib/datetime";

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

  return {
    title: `${event.title} — Bored`,
    description,
    openGraph: {
      title: event.title,
      description,
      type: "website",
      siteName: "Bored",
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
  return <EventDetailClient id={id} />;
}
