import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import { DevAgentation } from "@/components/dev/agentation";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SEEKO Studio",
  description: "SEEKO Game Studio Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${outfit.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <DevAgentation />
      </body>
    </html>
  );
}
