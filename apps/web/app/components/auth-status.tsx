'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from '@/lib/auth-client'
import { clearOfflinePages } from '@/lib/offline-cache'

/**
 * The one session-dependent piece of the otherwise server-rendered
 * SiteHeader -- isolated into its own Client Component so the rest of
 * the header (logo, "Find your spot") stays a Server Component. Renders
 * nothing while the session is still resolving, rather than guessing;
 * a one-frame gap is preferable to a flash of the wrong state.
 */
export function AuthStatus() {
  const { data: session, isPending, error } = useSession()

  // A failed session check (network, 429) isn't "signed out": show
  // nothing rather than a Log in link to someone who is signed in.
  if (isPending || error) return null

  if (!session) {
    return (
      <div className="flex items-center gap-3 sm:gap-4">
        <Link
          href="/login"
          className="whitespace-nowrap text-sm font-semibold text-white/85 no-underline hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-header rounded-sm"
        >
          Log in
        </Link>
        <Link
          href="/register"
          className="whitespace-nowrap rounded-md bg-[#d63c23] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white no-underline hover:bg-[#b8301b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-header"
        >
          Sign up
        </Link>
      </div>
    )
  }

  return <AccountMenu name={session.user.name} />
}

/**
 * The Account section: account settings, preferences (which also
 * links to the setup wizard) and sign-out (spots and the catch log live in the main nav). A
 * `role="menu"` button/popup pattern (like LocationSearch's combobox)
 * rather than several siblings racing for space at phone width, which
 * is exactly the text-wrap crowding this header fixed once already.
 * Works down to the narrowest widths: the trigger is
 * always just the account icon + name, truncated, never several separate
 * interactive texts.
 */
function AccountMenu({ name }: { name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const firstItemRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    firstItemRef.current?.focus()
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  async function handleSignOut() {
    setOpen(false)
    // Offline copies of your pages go too (shared devices).
    await clearOfflinePages()
    await signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Account menu, ${name}`}
        className="flex items-center gap-1.5 rounded-sm text-sm font-semibold text-white/85 no-underline hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-header"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20 a8 8 0 0 1 16 0" />
        </svg>
        {/* Name hidden below `sm` -- at phone width this plus "Find your
            spot" and the icon doesn't fit even truncated (a real name can
            still overflow a truncated max-width box, since the box's own
            width is what's fixed, not the space left after its siblings).
            The icon alone is still a real, labeled ("Account menu, {name}")
            target down to the narrowest widths. */}
        <span className="hidden max-w-[8rem] truncate sm:inline">{name}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 top-full z-20 mt-2 w-48 rounded-lg border border-border bg-surface py-1.5 shadow-[0_8px_28px_rgb(0_0_0/45%)]"
        >
          <Link
            ref={firstItemRef}
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-text no-underline hover:bg-bg focus-visible:outline-none focus-visible:bg-bg"
          >
            Account
          </Link>
          <Link
            href="/preferences"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-text no-underline hover:bg-bg focus-visible:outline-none focus-visible:bg-bg"
          >
            Preferences
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="block w-full px-4 py-2 text-left text-sm text-text no-underline hover:bg-bg focus-visible:outline-none focus-visible:bg-bg"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
