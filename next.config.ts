import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cockpit privé et 100 % dynamique (données Meta / TrendTrack par utilisateur connecté) :
  // les Cache Components n'apportent rien ici et compliquent la lecture de session.
  cacheComponents: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "medias.trendtrack.io" },
      { protocol: "https", hostname: "**.facebook.com" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
