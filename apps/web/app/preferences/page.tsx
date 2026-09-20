import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Container } from '@/app/components/ui'
import { auth } from '@/lib/auth'
import { PreferencesForm } from './preferences-form'

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

  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-sm flex-col gap-6 py-10 sm:py-16">
          <header>
            <h1 className="text-3xl font-bold text-text sm:text-4xl">Preferences</h1>
            <p className="mt-3 text-text-muted">
              Units, fishing style, and personal comfort thresholds.
            </p>
          </header>
          <PreferencesForm />
        </div>
      </Container>
    </main>
  )
}
