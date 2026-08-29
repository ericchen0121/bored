import { ImageResponse } from "next/og";
import { formatWhen } from "@/lib/datetime";
import { loadOgFonts } from "@/lib/og-assets";
import type { EventDetail, FilmDetail } from "@/components/detail/types";

export const OG_SIZE = { width: 1200, height: 630 } as const;

export type ShareCardProps = {
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
};

function BrandMark({ size = 72 }: { size?: number }) {
  const fontSize = Math.round(size * 0.62);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0c1218",
        borderRadius: Math.round(size * 0.22),
        border: "1px solid rgba(197, 212, 224, 0.18)",
        color: "#f2ebe0",
        fontFamily: "Fraunces",
        fontSize,
        fontWeight: 700,
        letterSpacing: "-0.05em",
        lineHeight: 1,
        paddingBottom: Math.round(size * 0.04),
      }}
    >
      <span>b</span>
      <span style={{ color: "#e8a54b" }}>.</span>
    </div>
  );
}

/** 1200×630 share card: poster + title + b. mark (Messages / social). */
export async function shareCardImage({
  title,
  subtitle,
  imageUrl,
}: ShareCardProps) {
  const fonts = await loadOgFonts();
  const hasPoster = Boolean(imageUrl?.trim());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#0c1218",
          color: "#f2ebe0",
        }}
      >
        {/* Atmosphere — matches site nav / body washes */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "radial-gradient(900px 500px at 8% 0%, rgba(61, 142, 165, 0.32), transparent 55%), radial-gradient(700px 420px at 100% 100%, rgba(217, 107, 76, 0.22), transparent 50%), linear-gradient(165deg, #15202b 0%, #0c1218 55%, #0a1015 100%)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            width: "100%",
            height: "100%",
            padding: "56px 64px",
            gap: 56,
          }}
        >
          {/* Poster */}
          <div
            style={{
              display: "flex",
              width: 420,
              height: 518,
              flexShrink: 0,
              borderRadius: 24,
              overflow: "hidden",
              background: "#1c2c3a",
              border: "1px solid rgba(197, 212, 224, 0.14)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            }}
          >
            {hasPoster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl!}
                alt=""
                width={420}
                height={518}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Fraunces",
                  fontSize: 120,
                  fontWeight: 700,
                  color: "#8fa8bc",
                  letterSpacing: "-0.04em",
                }}
              >
                <span style={{ color: "#f2ebe0" }}>b</span>
                <span style={{ color: "#e8a54b" }}>.</span>
              </div>
            )}
          </div>

          {/* Copy + brand */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              flex: 1,
              height: 518,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 22,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontFamily: "DM Sans",
                  fontSize: 22,
                  fontWeight: 600,
                  color: "#8fa8bc",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Bored
                <span style={{ color: "#e8a54b" }}>.</span>
              </div>
              <div
                style={{
                  display: "flex",
                  fontFamily: "Fraunces",
                  fontSize: title.length > 70 ? 48 : title.length > 42 ? 56 : 64,
                  fontWeight: 700,
                  lineHeight: 1.12,
                  letterSpacing: "-0.03em",
                  color: "#f2ebe0",
                  maxHeight: 280,
                  overflow: "hidden",
                }}
              >
                {title}
              </div>
              {subtitle ? (
                <div
                  style={{
                    display: "flex",
                    fontFamily: "DM Sans",
                    fontSize: 28,
                    fontWeight: 500,
                    color: "#c5d4e0",
                    lineHeight: 1.35,
                    maxHeight: 90,
                    overflow: "hidden",
                  }}
                >
                  {subtitle}
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
              }}
            >
              <BrandMark size={80} />
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts,
    },
  );
}

export function eventShareCardProps(event: EventDetail): ShareCardProps {
  const tz = event.timezone || "America/Los_Angeles";
  const when = formatWhen(event.startsAt, tz);
  const venue = event.venueName?.trim() || event.neighborhood?.trim();
  const subtitle = [venue, when].filter(Boolean).join(" · ");
  return {
    title: event.title,
    subtitle,
    imageUrl: event.imageUrl,
  };
}

export function movieShareCardProps(data: FilmDetail): ShareCardProps {
  const { film } = data;
  const bits = [
    film.year ? String(film.year) : null,
    film.genres?.slice(0, 2).join(", ") || null,
  ].filter(Boolean);
  return {
    title: film.title,
    subtitle: bits.length ? bits.join(" · ") : "Now playing",
    imageUrl: film.posterUrl || film.backdropUrl,
  };
}
