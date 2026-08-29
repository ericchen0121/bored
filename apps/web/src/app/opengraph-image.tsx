import { OG_SIZE, shareCardImage } from "@/lib/og-share-card";

export const alt = "Bored — things to do nearby";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return shareCardImage({
    title: "Find something to do.",
    subtitle: "Events, comedy, movies, and more nearby",
  });
}
