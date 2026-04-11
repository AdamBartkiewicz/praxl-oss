import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
});

const dmMono = DM_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Mobile viewport — Next.js 14+ no longer auto-injects this; without an
// explicit viewport export, mobile browsers fall back to the legacy 980px
// viewport and zoom out, making the app unreadable on phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  title: "Praxl - AI Skill Manager",
  description: "Manage, version, and deploy AI skills across all your tools. Create, edit, sync, and share skills for Claude Code, Cursor, Codex, and more.",
  metadataBase: new URL(APP_URL),
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Praxl - AI Skill Manager",
    description: "Manage, version, and deploy AI skills across all your tools. Create, edit, sync, and share skills for Claude Code, Cursor, Codex, and more.",
    url: APP_URL,
    siteName: "Praxl",
    type: "website",
    images: [{ url: "/logo-dark.png", width: 512, height: 512, alt: "Praxl" }],
  },
  twitter: {
    card: "summary",
    title: "Praxl - AI Skill Manager",
    description: "Manage, version, and deploy AI skills across all your tools.",
    images: ["/logo-dark.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${dmMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground">
        <script dangerouslySetInnerHTML={{ __html: `
          window.onerror=function(m,u,l,c,e){fetch("/api/errors",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:m,stack:e?.stack||"",url:u})}).catch(function(){})};
          window.onunhandledrejection=function(e){fetch("/api/errors",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:String(e.reason),stack:e.reason?.stack||""})}).catch(function(){})};
        `}} />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <Providers>
            <AppShell>{children}</AppShell>
            <Toaster />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
