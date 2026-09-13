import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Serif, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const display = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const body = Source_Serif_4({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Bias Check",
  description: "State a belief. Read what trustworthy sources say about it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
