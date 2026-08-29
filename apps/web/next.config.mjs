/** @type {import('next').NextConfig} */
const lanIp = process.env.LAN_IP?.trim();

const nextConfig = {
  transpilePackages: ["@bored/shared"],
  // Phone-on-Wi‑Fi hits Next via LAN IP; avoid cross-origin /_next/* warnings.
  ...(lanIp ? { allowedDevOrigins: [lanIp] } : {}),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "**.ticketm.net" },
      { protocol: "https", hostname: "**.livenationcdn.com" },
      { protocol: "https", hostname: "**.amazonaws.com" },
    ],
  },
};

export default nextConfig;
