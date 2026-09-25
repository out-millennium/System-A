import type { Metadata, Viewport } from "next";
import { Roboto, Geist_Mono, Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { I18nProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/ToastProvider";
import SkipLink from "@/components/SkipLink";
import NoNumberWheel from "@/components/NoNumberWheel";
import PublicChrome from "@/components/PublicChrome";

// Body / readable text — Roboto (Latin + Cyrillic + Latin-ext for FR/ES)
const roboto = Roboto({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});

// Simplified-Chinese fallback so 中文 renders in the same visual weight/rhythm.
const notoSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-noto-sc",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "System A",
    template: "%s — System A",
  },
  description:
    "System A — a formally declared, deterministic computational accounting infrastructure. Engineering-grade precision, transparency and neutrality.",
  // PWA: makes the app installable (add-to-home-screen). No service worker is
  // registered by default to avoid caching auth'd responses; add one later if
  // offline support is needed.
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#060707",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${roboto.variable} ${notoSC.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen antialiased">
        <SessionProvider>
          <I18nProvider>
            <ThemeProvider>
              <ToastProvider>
                <NoNumberWheel />
                <PublicChrome />
                <SkipLink />
                {/* Ambient infrastructure background — faint light, vignette, grain */}
                <div className="sa-ambient" aria-hidden="true" />
                <div className="sa-noise" aria-hidden="true" />
                <div
                  id="main-content"
                  tabIndex={-1}
                  className="sa-content scroll-mt-24 outline-none"
                >
                  {children}
                </div>
              </ToastProvider>
            </ThemeProvider>
          </I18nProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
