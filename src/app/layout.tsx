import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import * as stylex from "@stylexjs/stylex";

import { Shell } from "@/components/Shell";
import { color, font } from "@/styles/tokens.stylex";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body {...stylex.props(s.body)}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
