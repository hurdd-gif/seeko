import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { Outfit, JetBrains_Mono } from "next/font/google";
import { HapticsProvider } from "@/components/HapticsProvider";
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'oklch(0.970 0.012 85)' },
    { media: '(prefers-color-scheme: dark)', color: 'oklch(0.180 0.012 60)' },
  ],
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="SEEKO Studio" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body
        className={`${outfit.variable} ${jetbrainsMono.variable} antialiased bg-paper text-ink`}
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

        </HapticsProvider>
      </body>
    </html>
  );
}
