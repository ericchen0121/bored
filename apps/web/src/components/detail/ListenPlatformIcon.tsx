import type { ArtistListenPlatform } from "@/lib/artist-listen";

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "currentColor",
  "aria-hidden": true as const,
  focusable: false as const,
};

export function ListenPlatformIcon({
  platform,
}: {
  platform: ArtistListenPlatform;
}) {
  switch (platform) {
    case "spotify":
      return (
        <svg {...iconProps}>
          <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12S6.2 22.5 12 22.5 22.5 17.8 22.5 12 17.8 1.5 12 1.5zm4.6 15.1c-.2.3-.5.4-.8.2-2.2-1.3-5-1.6-8.3-.9-.3.1-.6-.1-.7-.4-.1-.3.1-.6.4-.7 3.6-.8 6.7-.4 9.2 1.1.3.1.4.5.2.7zm1.2-2.7c-.2.4-.7.5-1 .3-2.5-1.5-6.4-2-9.4-1.1-.4.1-.8-.1-.9-.5-.1-.4.1-.8.5-.9 3.4-1 7.7-.5 10.6 1.2.4.2.5.6.2 1zm.1-2.8C14.7 9.2 9.9 9 7.1 9.9c-.5.1-1-.2-1.1-.6-.2-.5.1-1 .6-1.1 3.2-.9 8.5-.8 11.8 1.3.4.3.6.8.3 1.2-.2.4-.7.6-1.2.3z" />
        </svg>
      );
    case "youtube_music":
      return (
        <svg {...iconProps}>
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 1.8a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4z" />
          <path d="M10.1 8.4v7.2L16.4 12 10.1 8.4z" />
        </svg>
      );
    case "soundcloud":
      return (
        <svg {...iconProps}>
          <path d="M17.6 10.1c-.3 0-.6 0-.9.1A4.3 4.3 0 0 0 8.6 8.3c0 .1 0 .2.1.3A3.2 3.2 0 0 0 5.5 15h12.1a2.4 2.4 0 1 0 0-4.9zM2.2 12.2h.8v4.1h-.8zm1.5-.9h.8v5h-.8zm1.5-.5h.8v5.5h-.8zm1.5.3h.8v5.2h-.8z" />
        </svg>
      );
  }
}
