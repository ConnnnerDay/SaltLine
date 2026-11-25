import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Container } from '@/app/components/ui'
import { auth, changeEmailEnabled, enabledSocialProviders } from '@/lib/auth'
import { smtpConfigured } from '@/lib/email'
import { AccountPage as AccountPageBody } from './account-page'

export const metadata: Metadata = { title: 'Account' }

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
  // Signed-in devices, for "Sign out everywhere else". Best-effort: the
  // page still works (and the button still works) if this fails.
  const sessions = await auth.api.listSessions({ headers: await headers() }).catch(() => null)
  // How this account signs in: "credential" is email + password.
  const accounts = await auth.api.listUserAccounts({ headers: await headers() }).catch(() => null)
  const providerIds = (accounts ?? []).map((account) => account.providerId)

  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-md flex-col gap-6 py-10 sm:py-14">
          <header>
            <h1 className="text-3xl font-bold text-text sm:text-4xl">Account</h1>
            <p className="mt-3 text-text-muted">Your sign-in, your data, and your account.</p>
          </header>
          <AccountPageBody
            name={session.user.name}
            email={session.user.email}
            otherSessions={sessions ? Math.max(0, sessions.length - 1) : null}
            // Unknown (lookup failed): assume a password, the usual case.
            hasPassword={accounts ? providerIds.includes('credential') : true}
            linkedProviders={Object.fromEntries(
              (accounts ?? [])
                .filter((account) => (enabledSocialProviders as string[]).includes(account.providerId))
                .map((account) => [account.providerId, account.id]),
            )}
            availableProviders={enabledSocialProviders}
            emailVerified={session.user.emailVerified}
            emailEnabled={smtpConfigured}
            changeEmailEnabled={changeEmailEnabled}
          />
        </div>
      </Container>
    </main>
  )
}
