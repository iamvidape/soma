import type { Metadata, Viewport } from "next";
import { Playfair_Display, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Soma",
  description: "Spaced-repetition flashcards",
  manifest: "/manifest.webmanifest",
  // iOS's "Add to Home Screen" doesn't reliably read the manifest's icons —
  // it specifically wants an apple-touch-icon link tag. Without one, iOS
  // silently falls back to a generated icon (the page title's first letter
  // on a plain background) instead of erroring, which is easy to miss.
  icons: {
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Soma",
    // iOS's automatic splash generation from the manifest's background_color
    // is unreliable in practice and often just shows a plain white screen on
    // launch. A single startupImage (no media query) is used by iOS as a
    // generic launch screen across device sizes.
    startupImage: "/apple-splash.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a1710",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
