"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import type { EventTypeKind } from "@bored/shared";
import { isFlyerAspectRatio } from "@bored/shared";

function useImageLoadState(imageUrl: string | null | undefined) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return {
    showImage: Boolean(imageUrl) && !failed,
    onError: () => setFailed(true),
  };
}

export function TypeIcon({ kind }: { kind: EventTypeKind }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (kind) {
    case "music":
      return (
        <svg {...common}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case "comedy":
      return (
        <svg {...common}>
          <path d="M12 2a4 4 0 0 1 4 4v1H8V6a4 4 0 0 1 4-4z" />
          <path d="M8 7h8v4a4 4 0 0 1-8 0V7z" />
          <path d="M12 15v3" />
          <path d="M8 21h8" />
        </svg>
      );
    case "tech":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8" />
          <path d="M12 16v4" />
        </svg>
      );
    case "food":
      return (
        <svg {...common}>
          <path d="M8 2v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V2" />
          <path d="M10 12v10" />
          <path d="M16 2v20" />
          <path d="M16 2c2 2 2 5 0 7" />
        </svg>
      );
    case "arts":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="9" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="15" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="10" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "outdoors":
      return (
        <svg {...common}>
          <path d="M3 19h18" />
          <path d="M5 19l5.5-11 3 6 2-3.5L19 19" />
        </svg>
      );
    case "nightlife":
      return (
        <svg {...common}>
          <path d="M12 3a8 8 0 1 0 9 9 6.5 6.5 0 0 1-9-9z" />
        </svg>
      );
    case "family":
      return (
        <svg {...common}>
          <circle cx="9" cy="7" r="2.5" />
          <circle cx="16" cy="8" r="2" />
          <path d="M3.5 19c.5-3 2.5-5 5.5-5s5 2 5.5 5" />
          <path d="M14 19c.3-2 1.5-3.5 3.5-3.5S21 17 21.2 19" />
        </svg>
      );
    case "movies":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 5v14" />
          <path d="M17 5v14" />
          <path d="M3 9h4" />
          <path d="M3 15h4" />
          <path d="M17 9h4" />
          <path d="M17 15h4" />
        </svg>
      );
    case "free":
      return (
        <svg {...common}>
          <path d="M12 3v18" />
          <path d="M8 7.5c0-1.5 1.5-2.5 4-2.5s4 1 4 2.5-1.5 2.5-4 2.5-4 1-4 2.5 1.5 2.5 4 2.5 4-1 4-2.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 9h8" />
          <path d="M8 13h5" />
        </svg>
      );
  }
}

export function CardPosterPlaceholder({
  kind,
  className,
  label,
  extraClassName,
}: {
  kind: EventTypeKind;
  className: string;
  label: string;
  extraClassName?: string;
}) {
  return (
    <div
      className={`poster placeholder ${className}${extraClassName ? ` ${extraClassName}` : ""}`}
      aria-label={label}
    >
      <TypeIcon kind={kind} />
      <span>{label}</span>
    </div>
  );
}

export function FeedCardMedia({
  imageUrl,
  eventType,
  placeholderLabel,
  isVideo = false,
}: {
  imageUrl?: string | null;
  eventType: { kind: EventTypeKind; className: string; label: string };
  placeholderLabel: string;
  isVideo?: boolean;
}) {
  const { showImage, onError } = useImageLoadState(imageUrl);

  if (!showImage) {
    return (
      <CardPosterPlaceholder
        kind={eventType.kind}
        className={eventType.className}
        label={placeholderLabel}
      />
    );
  }

  return (
    <div className={`card__media${isVideo ? " card__media--video" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl!} alt="" onError={onError} />
      {isVideo ? <span className="card__play" aria-hidden>▶</span> : null}
    </div>
  );
}

export function TimelineThumbMedia({
  imageUrl,
  eventType,
}: {
  imageUrl?: string | null;
  eventType?: { kind: EventTypeKind; className: string };
}) {
  const { showImage, onError } = useImageLoadState(imageUrl);

  if (!showImage) {
    if (eventType) {
      return (
        <div
          className={`timeline-row__thumb poster placeholder ${eventType.className}`}
          aria-hidden
        >
          <TypeIcon kind={eventType.kind} />
        </div>
      );
    }
    return <div className="timeline-row__thumb placeholder" aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl!}
      alt=""
      className="timeline-row__thumb"
      onError={onError}
    />
  );
}

export function DetailHeroMedia({
  imageUrl,
  eventType,
  placeholderLabel,
  fit: fitHint,
}: {
  imageUrl?: string | null;
  eventType: { kind: EventTypeKind; className: string; label: string };
  placeholderLabel: string;
  /** When known from ingest metadata; otherwise inferred on load from aspect ratio. */
  fit?: "cover" | "contain";
}) {
  const { showImage, onError } = useImageLoadState(imageUrl);
  const [measuredFit, setMeasuredFit] = useState<"cover" | "contain" | null>(
    null,
  );
  const [measuredForUrl, setMeasuredForUrl] = useState(imageUrl);
  if (measuredForUrl !== imageUrl) {
    setMeasuredForUrl(imageUrl);
    setMeasuredFit(null);
  }

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (!img.naturalWidth || !img.naturalHeight) return;
    setMeasuredFit(
      isFlyerAspectRatio(img.naturalHeight / img.naturalWidth)
        ? "contain"
        : "cover",
    );
  };

  // Metadata "contain" (e.g. RA flyers) is sticky — landscape party graphics
  // are still flyers. Pixel measurement can only upgrade cover → contain.
  const fit: "cover" | "contain" =
    fitHint === "contain" || measuredFit === "contain"
      ? "contain"
      : (measuredFit ?? fitHint ?? "cover");

  if (!showImage) {
    return (
      <CardPosterPlaceholder
        kind={eventType.kind}
        className={eventType.className}
        label={placeholderLabel}
        extraClassName="detail-body__hero-img"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl!}
      alt=""
      className={`detail-body__hero-img${fit === "contain" ? " detail-body__hero-img--flyer" : ""}`}
      onLoad={handleLoad}
      onError={onError}
    />
  );
}
