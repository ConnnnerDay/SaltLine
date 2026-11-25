import { enabledSocialProviders } from '@/lib/social-providers'
import { LoginPageClient } from './login-client'

// A Server Component so the page knows which "Continue with …" buttons
// this server has credentials for (lib/social-providers.ts).
// Rendered per request, not at build time: otherwise the buttons would
// reflect whatever credentials existed when the app was built.
export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return <LoginPageClient socialProviders={enabledSocialProviders} />
}
