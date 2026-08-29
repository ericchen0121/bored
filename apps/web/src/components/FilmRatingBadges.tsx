/** Brand marks for film ratings (inline SVG — no external CDN). */

type LogoSize = "sm" | "md" | "lg";

const LOGO_PX: Record<LogoSize, number> = {
  sm: 14,
  md: 22,
  lg: 28,
};

function logoSvgProps(size: LogoSize, className: string) {
  const px = LOGO_PX[size];
  return {
    width: px,
    height: px,
    viewBox: "0 0 24 24",
    className: `rating-logo ${className}`,
    "aria-hidden": true as const,
    focusable: false as const,
  };
}

/** Rotten Tomatoes tomatometer — fresh (≥60) or rotten splat. */
export function RottenTomatoesLogo({
  fresh = true,
  size = "sm",
}: {
  fresh?: boolean;
  size?: LogoSize;
}) {
  const props = logoSvgProps(size, "rating-logo--rt");
  if (fresh) {
    return (
      <svg {...props}>
        <path
          fill="#FA320A"
          d="M12 3.2c-.4 0-1.2.3-1.8.7-.3-1.1-1.1-2-2.2-2.2-.2 1.4.4 2.7 1.4 3.4C6.8 6.4 4.5 9.2 4.5 12.6c0 4.3 3.3 7.7 7.5 7.7s7.5-3.4 7.5-7.7c0-3.6-2.5-6.5-5.2-7.6.7-.9 1-2.1.7-3.3-.9.3-1.6 1.1-2 2.1-.4-.4-.8-.6-1-.6z"
        />
        <path
          fill="#2F8F2F"
          d="M12.2 3.4c.6 1.1 1.8 1.7 3.1 1.6-.4-1.2-1.4-2.1-2.7-2.4-.2.3-.3.5-.4.8z"
        />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path
        fill="#0C9B4A"
        d="M12.1 3.2c-1.2 1.4-1 3.2-.2 4.4-1.6-.4-3.2.2-4.2 1.4-.2-1.6-1.4-2.9-3-3.2.9 1.6 2.6 2.4 4.2 2.2-1.3 1.2-1.6 3.1-.8 4.6-1.5.1-2.8 1.1-3.4 2.5 1.6-.3 3.1.4 4 1.7-.9 1.1-.8 2.8.3 3.8-.4-1.5.4-3 1.8-3.6.2 1.6 1.4 2.9 3 3.2-.6-1.5.1-3.2 1.5-4 .9 1.4 2.6 2 4.2 1.6-.9-1.3-2.5-1.9-4-1.5 1.2-1.1 1.5-3 .7-4.4 1.5 0 2.9-.9 3.5-2.3-1.5.4-3.1-.2-4.1-1.5.9-1.2.8-3-.3-4.1z"
      />
    </svg>
  );
}

/** Letterboxd mark (three dots). */
export function LetterboxdLogo({ size = "sm" }: { size?: LogoSize }) {
  return (
    <svg {...logoSvgProps(size, "rating-logo--lb")}>
      <circle cx="6.2" cy="12" r="4.2" fill="#FF8000" />
      <circle cx="12" cy="12" r="4.2" fill="#00E054" />
      <circle cx="17.8" cy="12" r="4.2" fill="#40BCF4" />
    </svg>
  );
}

/** IMDb yellow badge mark. */
export function ImdbLogo({ size = "sm" }: { size?: LogoSize }) {
  const h = LOGO_PX[size];
  const w = Math.round(h * (64 / 32));
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 64 32"
      className="rating-logo rating-logo--imdb"
      aria-hidden
      focusable={false}
    >
      <rect width="64" height="32" rx="6" fill="#F5C518" />
      <text
        x="32"
        y="22.5"
        textAnchor="middle"
        fill="#1a1a1a"
        fontFamily="Arial Black, Helvetica Neue, Helvetica, Arial, sans-serif"
        fontSize="15"
        fontWeight="900"
        letterSpacing="-0.5"
      >
        IMDb
      </text>
    </svg>
  );
}

export type FilmRatings = {
  imdb?: number | null;
  rtCritics?: number | null;
  rtAudience?: number | null;
  letterboxd?: number | null;
};

/** Compact RT / Letterboxd / IMDb badges with brand logos. */
export function FilmRatingBadges({
  ratings,
  showAudience = false,
}: {
  ratings: FilmRatings | null | undefined;
  showAudience?: boolean;
}) {
  if (!ratings) return null;
  const { imdb, rtCritics, rtAudience, letterboxd } = ratings;
  if (
    imdb == null &&
    rtCritics == null &&
    (!showAudience || rtAudience == null) &&
    letterboxd == null
  ) {
    return null;
  }

  return (
    <div className="ratings">
      {rtCritics != null && (
        <span
          className="badge rating-badge rating-rt"
          title={`Rotten Tomatoes critics ${rtCritics}%`}
        >
          <RottenTomatoesLogo fresh={rtCritics >= 60} />
          <span className="rating-badge__value">{rtCritics}%</span>
        </span>
      )}
      {showAudience && rtAudience != null && (
        <span
          className="badge rating-badge rating-rt"
          title={`Rotten Tomatoes audience ${rtAudience}%`}
        >
          <RottenTomatoesLogo fresh={rtAudience >= 60} />
          <span className="rating-badge__value">
            <span className="rating-badge__sub">Aud</span> {rtAudience}%
          </span>
        </span>
      )}
      {letterboxd != null && (
        <span
          className="badge rating-badge rating-lb"
          title={`Letterboxd ${letterboxd}`}
        >
          <LetterboxdLogo />
          <span className="rating-badge__value">{letterboxd}</span>
        </span>
      )}
      {imdb != null && (
        <span className="badge rating-badge rating-imdb" title={`IMDb ${imdb}`}>
          <ImdbLogo />
          <span className="rating-badge__value">{imdb}</span>
        </span>
      )}
    </div>
  );
}
