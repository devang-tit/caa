import type { Metadata } from "next";
import { Geist, Geist_Mono, Nunito } from "next/font/google";
import { EMBED_COOKIE, EMBED_ORIGINS } from "@/lib/embed-origins";
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

// When the app is framed (only EMBED_ORIGINS may frame it, see next.config.ts):
// 1. Switch to the host app's look before first paint (html[data-embed] in
//    globals.css).
// 2. Set the Partitioned EMBED_COOKIE marker, so the server gives this frame
//    Partitioned auth cookies (lib/supabase/cookie-options.ts). The first time
//    only, delete unpartitioned sb-* auth cookies left by older builds: they
//    would shadow the partitioned ones. A delete without "Partitioned" never
//    touches the partitioned cookies.
const EMBED_SCRIPT = `(function(){try{if(window.self===window.top)return;document.documentElement.setAttribute("data-embed","host");if(/(?:^|; )${EMBED_COOKIE}=1(?:;|$)/.test(document.cookie))return;document.cookie.split("; ").forEach(function(c){var n=c.split("=")[0];if(n.indexOf("sb-")===0)document.cookie=n+"=; Max-Age=0; Path=/; Secure; SameSite=None"});document.cookie="${EMBED_COOKIE}=1; Max-Age=34560000; Path=/; Secure; SameSite=None; Partitioned"}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${nunito.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {EMBED_ORIGINS.length > 0 && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: EMBED_SCRIPT }} />
        </head>
      )}
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
