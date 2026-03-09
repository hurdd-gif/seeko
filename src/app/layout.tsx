import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { Outfit, JetBrains_Mono, Caveat } from "next/font/google";
import { HapticsProvider } from "@/components/HapticsProvider";
import { DevAgentation } from "@/components/dev/agentation";
import { DialRoot } from "dialkit";
import "dialkit/styles.css";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
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
  themeColor: '#1a1a1a',
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#1a1a1a" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1a1a1a" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#1a1a1a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body
        className={`${outfit.variable} ${jetbrainsMono.variable} ${caveat.variable} antialiased bg-background text-foreground`}
      >
        <HapticsProvider>
          {children}
          <Toaster
            richColors
            position="top-center"
            toastOptions={{
              className: 'seeko-toast',
              duration: 4000,
            }}
          />
          <DevAgentation />
          <DialRoot position="top-right" />
        </HapticsProvider>
      </body>
    </html>
  );
}
