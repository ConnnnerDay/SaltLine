'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from '@/lib/auth-client'
import { cx } from './ui/cx'

/**
 * Primary navigation for signed-in users: header links on wider screens
 * (`MainNavLinks`) and an app-style bottom tab bar on phones
 * (`MobileTabBar`). Both read the same `NAV_ITEMS` and mark the current
 * section with `aria-current="page"`. Anonymous visitors get neither --
 * the header's "Log in / Sign up" is their navigation.
 */

type NavItem = {
  href: string
  label: string
  isActive: (path: string) => boolean
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    label: 'Forecast',
    isActive: (path) => path === '/' || path.startsWith('/forecast'),
    icon: (
      <>
        <path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        <path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        <circle cx="12" cy="6" r="2.5" />
      </>
    ),
  },
  {
    href: '/locations',
    label: 'Spots',
    isActive: (path) => path.startsWith('/locations'),
    icon: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20.5 20.5 16 16" />
      </>
    ),
  },
  {
    href: '/saved',
    label: 'Saved',
    isActive: (path) => path.startsWith('/saved'),
    icon: <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1z" />,
  },
  {
    href: '/log',
    label: 'Log',
    isActive: (path) => path.startsWith('/log'),
    icon: (
      <>
        <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
        <path d="M8 10h8M8 14h8M8 18h5" />
      </>
    ),
  },
]

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Header links (sm and up). Signed out, the plain "Find your spot". */
export function MainNavLinks() {
  const path = usePathname() ?? '/'
  const { data: session, isPending } = useSession()
  if (isPending) return null

  const linkClass =
    'relative whitespace-nowrap rounded-sm py-1 text-sm font-semibold no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-header'

  if (!session) {
    return (
      <Link href="/locations" className={cx(linkClass, 'hidden text-white/85 hover:text-white sm:inline')}>
        Find your spot
      </Link>
    )
  }

  return (
    <nav aria-label="Main" className="hidden items-center gap-5 sm:flex">
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(path)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              linkClass,
              active ? 'text-white' : 'text-white/70 hover:text-white',
              // The active underline sits on the header's bottom edge.
              active &&
                'after:absolute after:inset-x-0 after:-bottom-[15px] after:h-0.5 after:rounded-full after:bg-[#38c0ff]',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Fixed bottom tab bar on phones (signed in only), plus a spacer so
 * page content never hides behind it. */
export function MobileTabBar() {
  const path = usePathname() ?? '/'
  const { data: session, isPending } = useSession()
  if (isPending || !session) return null
  // The setup wizard is a focused flow; no tab bar there.
  if (path.startsWith('/onboarding')) return null

  return (
    <>
      <div aria-hidden="true" className="h-[calc(4rem+env(safe-area-inset-bottom))] sm:hidden" />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-header-border bg-header/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
      >
        <ul className="mx-auto flex h-16 max-w-md items-stretch">
          {NAV_ITEMS.map((item) => {
            const active = item.isActive(path)
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex h-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-semibold no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300',
                    active ? 'text-[#38c0ff]' : 'text-white/60 hover:text-white',
                  )}
                >
                  <NavIcon>{item.icon}</NavIcon>
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
