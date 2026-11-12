import type { Metadata } from "next";
import { Geist, Geist_Mono, Nunito } from "next/font/google";
import { EMBED_ORIGINS } from "@/lib/embed-origins";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The host app's font, used only when embedded. Not preloaded, so a normal
// visit never downloads it.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Realtime Chat",
  description: "A realtime chat app built with Next.js and Supabase",
};

// When the app is framed (only EMBED_ORIGINS may frame it, see next.config.ts),
// switch to the host app's look before first paint: html[data-embed] in globals.css.
const EMBED_THEME_SCRIPT = `(function(){try{if(window.self!==window.top)document.documentElement.setAttribute("data-embed","host")}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${nunito.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {EMBED_ORIGINS.length > 0 && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: EMBED_THEME_SCRIPT }} />
        </head>
      )}
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
