import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Container } from '@/app/components/ui'
import { auth } from '@/lib/auth'
import { internalApiFetch } from '@/lib/internal-api-client'
import { PreferencesForm } from './preferences-form'

export const metadata: Metadata = { title: 'Preferences' }

/**
 * Sprint 36's one authenticated page -- account-required routing itself
 * is sprint 29's separate job (this repo's public forecast/search pages
 * deliberately stay public, docs/product-definition.md's "Public,
 * non-personalized share pages" -- see this file's own git history for
 * the full reasoning), but a page with nothing to show an anonymous
 * visitor still needs its own redirect regardless of that broader
 * policy. Session check happens here, server-side, before any client
 * code runs -- an anonymous visitor never even receives the form markup.
 */
export default async function PreferencesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect('/login')
  }
  const locations = await internalApiFetch<{ id: string; name: string; state: string }[]>(
    '/v1/locations',
  ).catch(() => [])
  const locationNames = Object.fromEntries(
    locations.map((location) => [location.id, `${location.name}, ${location.state}`]),
  )

  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-2xl flex-col gap-6 py-10 sm:py-14">
          <header>
            <h1 className="text-3xl font-bold text-text sm:text-4xl">Preferences</h1>
            <p className="mt-2 text-text-muted">
              Your fishing profile shapes every forecast you see.{' '}
              <a href="/onboarding?next=/preferences" className="font-semibold">
                Walk through setup again
              </a>
            </p>
          </header>
          <PreferencesForm locationNames={locationNames} />
        </div>
      </Container>
    </main>
  )
}
