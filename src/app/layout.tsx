import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/layouts/theme-provider";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "ui/sonner";
import { BASE_THEMES } from "lib/const";

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

const themes = BASE_THEMES.flatMap((t) => [t, `${t}-dark`]);

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
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="default-dark"
          themes={themes}
          disableTransitionOnChange
        >
          <div id="root">
            <SessionProvider>
              {children}
              <Toaster richColors />
            </SessionProvider>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
