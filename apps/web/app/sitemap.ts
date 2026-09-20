import type { MetadataRoute } from 'next'
import { internalApiFetch } from '@/lib/internal-api-client'

// Same SITE_URL convention app/layout.tsx and lib/auth.ts already use --
// see app/layout.tsx's docstring.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

type CuratedLocation = { id: string }

// Same reasoning as app/forecast/[locationId]/page.tsx: this calls
// apps/api, which needs INTERNAL_SIGNING_KEY_ID/SECRET -- env vars a CI
// build (apps/web/README.md's "Checks" section) never sets, unlike
// BETTER_AUTH_SECRET's build-time placeholder. Without this, `next
// build` tries to prerender /sitemap.xml at build time and fails on the
// same "not set" error a live request would only hit if actually
// misconfigured at runtime.
export const dynamic = 'force-dynamic'

/**
 * Sprint 49's last named piece: `app/robots.ts` had been carrying a
 * docstring explaining why it emitted no `sitemap` directive -- no
 * endpoint could enumerate every curated location, only
 * `/v1/locations/search`'s query-based lookup. `GET /v1/locations`
 * (apps/api, this same change) closes that gap, so this can finally
 * exist: one URL per curated location's public, non-personalized
 * `/share/[locationId]` page (sprint 49's actual organic-growth
 * surface -- `/forecast/*` is session-gated since sprint 29 and has no
 * business in a sitemap), plus the home page.
 *
 * No per-location `lastModified` -- the curated dataset is static
 * (`apps/api/app/providers/locations.py`'s bundled JSON), so there's no
 * real per-entry timestamp to report; inventing one (e.g. "now," on
 * every build) would claim freshness this page has no evidence for.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locations = await internalApiFetch<CuratedLocation[]>('/v1/locations')

  return [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    ...locations.map((location) => ({
      url: `${SITE_URL}/share/${encodeURIComponent(location.id)}`,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ]
}
