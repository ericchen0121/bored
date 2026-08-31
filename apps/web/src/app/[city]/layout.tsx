import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FEED_CITIES, type FeedCity } from "@bored/shared";
import { cityShareMetadata } from "@/lib/city-share";

type Props = {
  children: React.ReactNode;
  params: Promise<{ city: string }>;
};

function parseFeedCity(value: string): FeedCity | null {
  return FEED_CITIES.includes(value as FeedCity) ? (value as FeedCity) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city } = await params;
  const feedCity = parseFeedCity(city);
  if (!feedCity) notFound();
  return cityShareMetadata(feedCity);
}

export default function CityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
