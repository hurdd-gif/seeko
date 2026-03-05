import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster richColors position="top-center" />
        <DevAgentation />
      </body>
    </html>
  );
}
