import type { Metadata, Viewport } from 'next'
import './globals.css'
import { OfflineBanner } from './offline-banner'
import { ServiceWorkerRegistration } from './service-worker-registration'
import { SiteHeader } from './components/site-header'

// Sprint 49 ("SEO and sharing"): NEXT_PUBLIC_SITE_URL lets metadataBase
// (and every relative canonical/OpenGraph URL built from it, here and
// in per-page generateMetadata) resolve to the real deployed origin
// once one exists (docs/CANONICAL_ROADMAP.md's Phase 1 blockers 9/10 --
// Vercel isn't provisioned yet). Defaults to local dev's own origin so
// `next build`/`next dev` never need it set to produce valid URLs.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Saltline',
    template: '%s — Saltline',
  },
  description:
    'Clear go/no-go fishing forecasts for surf and pier anglers, built from real tide, wind, and wave data.',
  openGraph: {
    siteName: 'Saltline',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
  // Safari on iOS only started reading the manifest's own
  // `display: 'standalone'` in 16.4 -- these two tags are still needed
  // for "Add to Home Screen" to open without Safari's own chrome on
  // older iOS, matching the manifest's install intent.
  appleWebApp: {
    capable: true,
    title: 'Saltline',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Without this, the browser renders native UI (scrollbars, form
  // control chrome) in its light-only default even on the dark theme
  // (globals.css's `@media (prefers-color-scheme: dark)` block), which
  // clashes visibly -- a light scrollbar/select on an otherwise dark
  // page. Declaring both tells the browser it can pick either to match
  // the same prefers-color-scheme query the app's own CSS already uses.
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f6f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0d2530' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      {/*
        Space Grotesk / Public Sans load via a plain stylesheet link, not
        next/font/google -- that API fetches the font files at *build*
        time, which fails wherever outbound network access is
        restricted (this sandbox included). A <link> loads client-side
        at runtime instead, works identically once actually deployed,
        and is the one external stylesheet host apps/web's CSP already
        allows (next.config.ts's style-src).
      */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Public+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <ServiceWorkerRegistration />
        <OfflineBanner />
        <SiteHeader />
        {children}
      </body>
    </html>
  )
}
