/** Subtle Luma-style live pulse — city-local “now” via UTC instant compare. */
export function LiveNowBadge({ label = "Now" }: { label?: string }) {
  return (
    <span className="live-now" aria-label="Happening now">
      <span className="live-now__dot" aria-hidden />
      <span className="live-now__label">{label}</span>
    </span>
  );
}
