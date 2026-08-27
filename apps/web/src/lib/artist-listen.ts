/** Search URLs so you can preview an artist before committing to a show. */

export type ArtistListenPlatform = "spotify" | "youtube_music" | "soundcloud";

export type ArtistListenLink = {
  platform: ArtistListenPlatform;
  label: string;
  href: string;
};

export function artistListenLinks(artistName: string): ArtistListenLink[] {
  const q = artistName.trim();
  if (!q) return [];

  const encoded = encodeURIComponent(q);
  return [
    {
      platform: "spotify",
      label: "Spotify",
      href: `https://open.spotify.com/search/${encoded}`,
    },
    {
      platform: "youtube_music",
      label: "YouTube Music",
      href: `https://music.youtube.com/search?q=${encoded}`,
    },
    {
      platform: "soundcloud",
      label: "SoundCloud",
      href: `https://soundcloud.com/search?q=${encoded}`,
    },
  ];
}
