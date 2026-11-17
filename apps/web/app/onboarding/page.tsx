import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Container } from '@/app/components/ui'
import { auth } from '@/lib/auth'
import { safeRedirectTarget } from '@/lib/safe-redirect'
import { ProfileSetup } from './profile-setup'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Set up your profile' }

type Props = { searchParams: Promise<{ next?: string }> }

/**
 * Profile setup after registration (restored from the original app's
 * setup wizard): home spot, how you fish, your gear and your comfort
 * limits. Everything is skippable; the answers personalize forecasts
 * (apps/api's app.domain.personalize). Signed-in visitors who haven't
 * finished or skipped it are sent here from "/" (app/page.tsx).
 */
export default async function OnboardingPage({ searchParams }: Props) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/onboarding')
  const { next } = await searchParams

  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-2xl flex-col gap-6 py-10 sm:py-14">
          <ProfileSetup next={safeRedirectTarget(next ?? null, '/locations')} />
        </div>
      </Container>
    </main>
  )
}
