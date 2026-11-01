import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Verdict", template: "%s · Verdict" },
  description: "Cockpit de pilotage Meta Ads et veille concurrentielle.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0d14",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geist.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
