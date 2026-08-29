import { fetchEventForShare } from "@/lib/og-assets";
import {
  eventShareCardProps,
  OG_SIZE,
  shareCardImage,
} from "@/lib/og-share-card";

export const alt = "Bored event";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await fetchEventForShare(id);
  if (!event) {
    return shareCardImage({
      title: "Bored",
      subtitle: "Things to do nearby",
    });
  }
  return shareCardImage(eventShareCardProps(event));
}
