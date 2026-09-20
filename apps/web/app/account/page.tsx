import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Container } from '@/app/components/ui'
import { auth } from '@/lib/auth'
import { AccountPage as AccountPageBody } from './account-page'

/**
 * Sprint 45 ("Privacy and deletion")'s self-service export/deletion --
 * required at v1 launch per the round-2 product decision, not deferred.
 * Session-gated the same way app/preferences/page.tsx is: this page has
 * nothing to show an anonymous visitor regardless of sprint 29's
 * broader account-required-routing policy. Deliberately its own page,
 * not folded into /preferences -- that page is forecast-related
 * settings (units, thresholds), this one is account management (your
 * data, your account), a different concern with its own destructive
 * action that shouldn't sit next to a routine settings form.
 */
export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect('/login?next=/account')
  }

  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-sm flex-col gap-6 py-10 sm:py-16">
          <header>
            <h1 className="text-3xl font-bold text-text sm:text-4xl">Account</h1>
            <p className="mt-3 text-text-muted">Your data, and your account.</p>
          </header>
          <AccountPageBody />
        </div>
      </Container>
    </main>
  )
}
