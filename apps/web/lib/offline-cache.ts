/**
 * The service worker (public/sw.js) keeps signed-in pages for offline
 * use in Cache Storage, which every account on this browser shares.
 * Those pages are personal now (your home forecast at "/", your saved
 * spots in the spot switcher, your fishing style), so they must not
 * outlive the account that loaded them on a shared device.
 */
const OWNER_KEY = 'saltline-offline-owner'

/** Deletes the offline copies of pages (the app shell and assets stay). */
export async function clearOfflinePages(): Promise<void> {
  try {
    if (!('caches' in window)) return
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.endsWith('-pages')).map((key) => caches.delete(key)))
  } catch {
    // Best-effort: no Cache Storage (private mode, old browser) means no copies.
  }
}

/** Clears the offline pages when the signed-in account differs from the
 * one they were saved for (signed out counts as a change). */
export async function syncOfflineOwner(userId: string | null): Promise<void> {
  let owner: string | null = null
  try {
    owner = localStorage.getItem(OWNER_KEY)
  } catch {
    // Storage blocked: clear to be safe.
  }
  if (owner === userId && owner !== null) return
  await clearOfflinePages()
  try {
    if (userId) localStorage.setItem(OWNER_KEY, userId)
    else localStorage.removeItem(OWNER_KEY)
  } catch {
    // Ignore: the next load clears again, which is still safe.
  }
}
