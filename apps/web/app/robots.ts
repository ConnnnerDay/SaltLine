import type { MetadataRoute } from 'next'

// Same SITE_URL convention app/layout.tsx and app/sitemap.ts use.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/**
 * Sprint 49 ("SEO and sharing")'s "private dashboards" half of this
 * sprint's acceptance bar -- a real `Disallow` rule for authenticated
 * routes -- lands here now that sprint 29 ("account-required routing")
 * actually gates some: `/locations` (search) and `/forecast/*` (the
 * core, session-gated forecast lookup) redirect an anonymous visitor
 * (and a crawler, which never carries a session cookie) straight to
 * `/login`, so a search engine indexing them would only ever see a
 * login page, not real content -- `Disallow` keeps that redirect chain
 * out of the index entirely rather than indexing it as a dead end.
 * `/share/*` (the public, non-personalized share page sprint 49
 * originally built, moved off `/forecast/*`'s now-gated URLs) and `/`
 * stay allowed -- that's the actual organic-growth surface this sprint
 * exists for. `/preferences` and `/api/*` are also disallowed: the
 * former is session-gated same as `/locations`/`/forecast/*`, the
 * latter was never meant to be crawled regardless. `/saved` (sprint
 * 37's session-gated saved-locations dashboard) and `/account` (sprint
 * 45's export/deletion page), both added after this file was first
 * written, are disallowed for the same reason as `/preferences` -- they
 * just hadn't existed yet the last time this list was reviewed.
 *
 * `sitemap` now points at `app/sitemap.ts` (closing out this sprint's
 * one remaining named piece): that file's own docstring covers why it
 * could finally exist (`GET /v1/locations`, apps/api, this same
 * change) and why it lists `/share/*` rather than the session-gated
 * `/forecast/*` this Disallow rule already excludes.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/locations', '/forecast/', '/preferences', '/saved', '/account', '/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
