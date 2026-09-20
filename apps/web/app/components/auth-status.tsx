'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from '@/lib/auth-client'

/**
 * The one session-dependent piece of the otherwise server-rendered
 * SiteHeader -- isolated into its own Client Component so the rest of
 * the header (logo, "Find your spot") stays a Server Component. Renders
 * nothing while the session is still resolving, rather than guessing;
 * a one-frame gap is preferable to a flash of the wrong state.
 */
export function AuthStatus() {
  const { data: session, isPending } = useSession()

  if (isPending) return null

  if (!session) {
    return (
      <div className="flex items-center gap-3 sm:gap-4">
        <Link
          href="/login"
          className="whitespace-nowrap text-sm font-semibold text-primary no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-sm"
        >
          Log in
        </Link>
        <Link
          href="/register"
          className="whitespace-nowrap text-sm font-semibold text-primary no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-sm"
        >
          Sign up
        </Link>
      </div>
    )
  }

  return <AccountMenu name={session.user.name} />
}

/**
 * Sprint 37 replaced the flat "name link + sign out button" pair with a
 * real menu once there were multiple destinations (Preferences, Saved
 * spots, and -- sprint 45 -- Account) plus sign-out to fit -- a
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
        className="flex items-center gap-1.5 rounded-sm text-sm font-semibold text-primary no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
          className="absolute right-0 top-full z-20 mt-2 w-48 rounded-lg border border-border bg-surface py-1.5 shadow-lg"
        >
          <Link
            ref={firstItemRef}
            href="/preferences"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-text no-underline hover:bg-bg focus-visible:outline-none focus-visible:bg-bg"
          >
            Preferences
          </Link>
          <Link
            href="/saved"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-text no-underline hover:bg-bg focus-visible:outline-none focus-visible:bg-bg"
          >
            Saved spots
          </Link>
          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-text no-underline hover:bg-bg focus-visible:outline-none focus-visible:bg-bg"
          >
            Account
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
