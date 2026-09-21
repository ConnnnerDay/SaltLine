'use client'

import { useOffline } from 'next/offline'

/**
 * Sprint 38 ("PWA baseline"): a site-wide connectivity signal, adapted
 * straight from node_modules/next/dist/docs/01-app/02-guides/
 * offline-support.md's own root-layout example. `useOffline` (backed
 * by `experimental.useOffline`, next.config.ts) is more reliable than
 * `navigator.onLine`, which stays `true` on a device connected to
 * Wi-Fi with no real upstream -- exactly the "captive portal, broken
 * DNS, dead upstream" case that guide names.
 */
export function OfflineBanner() {
  const isOffline = useOffline()

  if (!isOffline) return null

  return (
    <div
      role="status"
      className="bg-marginal-bg px-4 py-2 text-center text-sm font-semibold text-marginal-text"
    >
      You&apos;re offline. Showing what&apos;s already loaded; pending requests will
      retry once you&apos;re back online.
    </div>
  )
}
