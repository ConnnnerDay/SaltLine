import type { Metadata, Viewport } from 'next'
import './globals.css'
import { OfflineBanner } from './offline-banner'
import { ServiceWorkerRegistration } from './service-worker-registration'
import { SiteHeader } from './components/site-header'
import { MobileTabBar } from './components/main-nav'

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
    'Fishing forecasts for surf and pier anglers: a rating for today, the best hours, and what’s biting, from live tide, wind and wave data.',
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
  // Dark is the default theme (as in the original Saltline); light is
  // opt-in via the header toggle, so native UI defaults to dark too.
  colorScheme: 'dark light',
  themeColor: '#07131f',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Applies a saved light-theme choice before first paint so the
          page never flashes dark first. Dark needs no attribute -- it's
          globals.css's default. Inline is allowed by next.config.ts's
          script-src 'unsafe-inline'.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('theme')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}",
          }}
        />
      </head>
      <body>
        <ServiceWorkerRegistration />
        <OfflineBanner />
        <SiteHeader />
        {children}
        <MobileTabBar />
      </body>
    </html>
  )
}
