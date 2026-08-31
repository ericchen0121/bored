import { FEED_CITIES, type FeedCity } from "@bored/shared";
import { cityShareCardProps } from "@/lib/city-share";
import { OG_SIZE, shareCardImage } from "@/lib/og-share-card";

export const alt = "Bored — things to do nearby";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const feedCity = FEED_CITIES.includes(city as FeedCity)
    ? (city as FeedCity)
    : "sf";
  return shareCardImage(cityShareCardProps(feedCity));
}
