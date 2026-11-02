import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cockpit privé et 100 % dynamique (données Meta / TrendTrack par utilisateur connecté) :
  // les Cache Components n'apportent rien ici et compliquent la lecture de session.
  cacheComponents: false,
  experimental: {
    // Un écran déjà visité se réaffiche instantanément pendant 30 s (cache du routeur côté
    // navigateur) ; les données restent fraîches grâce à la resynchronisation en arrière-plan.
    staleTimes: { dynamic: 30, static: 180 },
  },
  // ffmpeg (binaire) et sharp restent des modules Node natifs, hors du bundle.
  serverExternalPackages: ["ffmpeg-static", "sharp"],
  // Le binaire ffmpeg n'est embarqué que dans la fonction du Rapprochement (~80 Mo).
  outputFileTracingIncludes: {
    "/[shop]/rapprochement": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
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
