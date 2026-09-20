import type { MetadataRoute } from 'next'

/**
 * Web App Manifest (Next's app/manifest.ts file convention -- auto-served
 * at /manifest.webmanifest with the <link rel="manifest"> tag injected
 * automatically, no layout.tsx change needed). Installability metadata
 * only: name/icons/theme so "Add to Home Screen" shows the real Saltline
 * identity instead of a generic browser icon and title. Deliberately not
 * a claim on sprint 38 ("PWA baseline") itself -- that row's actual bar
 * is full offline app-shell navigation with graceful degradation via a
 * service worker, none of which this touches.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Saltline',
    short_name: 'Saltline',
    description:
      'Clear go/no-go fishing forecasts for surf and pier anglers, built from real tide, wind, and wave data.',
    start_url: '/',
    display: 'standalone',
    // Matches app/layout.tsx's light-mode viewport.themeColor -- the
    // manifest spec has no dark-mode variant, so this is the one value
    // used for the splash-screen background before anything paints.
    background_color: '#f2f6f7',
    // The Saltline logomark's own dark-teal tile background (app/icon.tsx),
    // used here as the install/splash-screen chrome color.
    theme_color: '#1c4a56',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/icon-192', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512', sizes: '512x512', type: 'image/png' },
    ],
  }
}
