/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@bored/shared"],
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
