import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Stryde — Soccer footage to team insights",
    template: "%s · Stryde",
  },
  description:
    "Stryde turns short soccer clips into annotated playback, estimated team possession, heatmaps and team statistics — analyzed locally in your browser.",
};

export const viewport: Viewport = {
  themeColor: "#07131D",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
