"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { trackDetailOpened } from "@/lib/analytics";
import { FeedBackLink } from "@/components/FeedBackLink";
import { EventDetailContent } from "@/components/detail/EventDetailContent";
import type { EventDetail } from "@/components/detail/types";

export function EventDetailClient({ id }: { id: string }) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<EventDetail>(`/v1/events/${id}`)
      .then((data) => {
        setEvent(data);
        trackDetailOpened({
          kind: "event",
          id,
          surface: "standalone",
        });
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) return <p className="muted">{error}</p>;
  if (!event) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="topbar">
        <FeedBackLink />
      </div>
      <EventDetailContent event={event} />
    </>
  );
}
