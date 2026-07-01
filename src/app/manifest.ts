import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Soma — Flashcards",
    short_name: "Soma",
    description: "Spaced-repetition flashcards for language learning",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1a1710",
    theme_color: "#1a1710",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
