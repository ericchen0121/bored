"use client";

import { useRouter } from "next/navigation";
import { feedHomeHref } from "@/lib/feed-prefs";

/** Returns to the last feed view (mode, area, sources). */
export function FeedBackLink() {
  const router = useRouter();

  return (
    <a
      href={feedHomeHref()}
      onClick={(e) => {
        e.preventDefault();
        router.push(feedHomeHref());
      }}
    >
      ← Feed
    </a>
  );
}
