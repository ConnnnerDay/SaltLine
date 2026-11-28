'use client'

import { useEffect } from 'react'
import { useSession } from '@/lib/auth-client'
import { syncOfflineOwner } from '@/lib/offline-cache'

/**
 * Sprint 38 ("PWA baseline"): registers public/sw.js -- see that
 * file's module docstring for what it does and why it exists
 * alongside `experimental.useOffline` rather than instead of it.
 * Production only: a service worker actively caching `next dev`'s
 * unstable, unhashed dev bundles would fight hot-reload and serve
 * stale code between saves, the same reasoning most Next.js PWA
 * guides give for skipping SW registration in development.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Installability/offline support degrades gracefully without a
      // worker (every route still works online) -- nothing here needs
      // to surface a user-facing error for a failed registration.
    })
  }, [])

  // Offline copies of personal pages belong to one account: when another
  // signs in (or nobody is signed in), they go. Not while the session
  // check is pending or failed: unknown isn't "signed out".
  const { data: session, isPending, error } = useSession()
  const userId = session?.user.id ?? null
  useEffect(() => {
    if (isPending || error) return
    void syncOfflineOwner(userId)
  }, [userId, isPending, error])

  return null
}
