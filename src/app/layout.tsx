import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lecture Notes AI — Record. Transcribe. Study.",
  description:
    "Turn college lecture recordings into structured Markdown study notes, stored in your private GitHub repository.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23722F37'/%3E%3Cpath d='M10 21.5c0-1.4 1.2-2.6 3-3.1v-4.8c0-.7.4-1.3 1-1.5l6.6-2.2c.9-.3 1.9.4 1.9 1.4v5.7c1.5.4 2.5 1.4 2.5 2.6 0 1.6-1.7 2.9-3.7 2.9s-3.7-1.3-3.7-2.9c0-1.2.9-2.2 2.2-2.6v-2.4l-3.8 1.3v5.5c.1.2.1.3 0 .5-.2 1.5-1.8 2.6-3.7 2.6s-3.3-1.3-3.3-2.9z' fill='%23E8D1D4'/%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0A0A0C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>{children}</body>
    </html>
  );
}
