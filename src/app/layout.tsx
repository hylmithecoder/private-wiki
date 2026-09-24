import type { Metadata, Viewport } from "next";
import { Caveat, Geist, Geist_Mono, Kalam, Patrick_Hand } from "next/font/google";
import * as stylex from "@stylexjs/stylex";

import { Shell } from "@/components/Shell";
import { color, font } from "@/styles/tokens.stylex";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Handwriting fonts for the lined-paper print view. Not preloaded: the
// browser only downloads them when a print actually uses one.
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], preload: false });
const patrickHand = Patrick_Hand({ variable: "--font-patrick-hand", subsets: ["latin"], weight: "400", preload: false });
const kalam = Kalam({ variable: "--font-kalam", subsets: ["latin"], weight: ["400", "700"], preload: false });

export const metadata: Metadata = {
  title: { default: "Wiki", template: "%s - Wiki" },
  description: "Private wiki",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e6ebe7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f0d" },
  ],
  colorScheme: "light dark",
};

const s = stylex.create({
  body: {
    minHeight: "100dvh",
    fontFamily: font.sans,
    color: color.text,
    backgroundColor: color.bg,
  },
});

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} ${patrickHand.variable} ${kalam.variable}`}
    >
      <body {...stylex.props(s.body)}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
