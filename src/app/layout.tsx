import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
// broadcast-graphics voice for the scorebug, overlay tags and large stat figures
const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Stryde: match footage to team insights",
    template: "%s | Stryde",
  },
  description:
    "Stryde turns short football clips into annotated playback, team possession estimates, heatmaps and side-by-side team statistics, analyzed privately in your browser.",
};

export const viewport: Viewport = {
  themeColor: "#07131D",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${barlow.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
