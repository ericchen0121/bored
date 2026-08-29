import { fetchMovieForShare } from "@/lib/og-assets";
import {
  movieShareCardProps,
  OG_SIZE,
  shareCardImage,
} from "@/lib/og-share-card";

export const alt = "Bored movie";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchMovieForShare(id);
  if (!data?.film) {
    return shareCardImage({
      title: "Bored",
      subtitle: "Movies nearby",
    });
  }
  return shareCardImage(movieShareCardProps(data));
}
