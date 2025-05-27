import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/layouts/theme-provider";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MCP Chat",
  description:
    "MCP Chat is a chatbot that uses the MCP Tools to answer questions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div id="root">
          <ThemeProvider
            attribute="data-theme"
            defaultTheme="zinc-dark"
            themes={[
              ...[
                "zinc",
                "slate",
                "stone",
                "gray",
                "blue",
                "orange",
                "pink",
                "bubblegum-pop",
                "cyberpunk-neon",
                "retro-arcade",
                "tropical-paradise",
                "steampunk-cogs",
                "neon-synthwave",
                "pastel-kawaii",
                "space-odyssey",
                "vintage-vinyl",
                "misty-harbor",
                "zen-garden",
              ].flatMap((t) => [t, `${t}-dark`]),
            ]}
            disableTransitionOnChange
          >
            <SessionProvider>
              {children}
              <Toaster richColors />
            </SessionProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
