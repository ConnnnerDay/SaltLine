import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { LocationsSearchPage } from './locations-search'

/**
 * Sprint 29 ("Account-required routing"): docs/product-definition.md's
 * "Access: an account is required for the core forecast experience" and
 * "Core browsing requires a verified account" read literally -- search
 * and per-location forecast lookup are that core experience. Checked
 * server-side, same pattern app/preferences/page.tsx already uses:
 * `redirect()` fires before any client code (LocationsSearchPage) ever
 * reaches an anonymous visitor.
 *
 * The public, non-personalized share page (sprint 49's original job,
 * "added only after authenticated forecast behavior is launch-ready"
 * per that same doc) moved to app/share/[locationId]/page.tsx instead
 * of staying at this now-gated flow's URLs -- see that file's docstring
 * for the full account of the split.
 */
export default async function LocationsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect('/login?next=/locations')
  }

  return <LocationsSearchPage />
}
