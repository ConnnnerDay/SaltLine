'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from '@/lib/auth-client'
import { cx } from './ui/cx'

/**
 * Navigation for signed-in users, grouped into sections of related pages:
 *
 * - Forecast: today's call (/, /forecast/*)
 * - Spots: finding a spot and the ones you saved (/locations, /saved)
 * - Fish: the fish guide and your own catch log (/fish, /log)
 * - Account: the account menu in the header (/account, /preferences;
 *   the setup wizard is linked from Preferences)
 *
 * The first three are header links on wider screens (`MainNavLinks`) and
 * an app-style bottom tab bar on phones (`MobileTabBar`); Account is the
 * header's account menu on both. A section with more than one page gets
 * a row of tabs under the header (`SectionTabs`). Anonymous visitors get
 * none of this -- the header's "Log in / Sign up" is their navigation.
 */

type SubPage = { href: string; label: string; isActive: (path: string) => boolean }

/** The pages inside each multi-page section, in tab order. */
const SECTION_PAGES: SubPage[][] = [
  [
    { href: '/locations', label: 'Find a spot', isActive: (path) => path.startsWith('/locations') },
    { href: '/saved', label: 'Saved spots', isActive: (path) => path.startsWith('/saved') },
  ],
  [
    { href: '/fish', label: 'Fish guide', isActive: (path) => path.startsWith('/fish') },
    { href: '/log', label: 'Catch log', isActive: (path) => path.startsWith('/log') },
  ],
  [
    { href: '/account', label: 'Account', isActive: (path) => path.startsWith('/account') },
    { href: '/preferences', label: 'Preferences', isActive: (path) => path.startsWith('/preferences') },
  ],
]

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
    isActive: (path) => path.startsWith('/locations') || path.startsWith('/saved'),
    icon: (
      <>
        <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
        <circle cx="12" cy="10" r="2.4" />
      </>
    ),
  },
  {
    href: '/fish',
    label: 'Fish',
    isActive: (path) => path.startsWith('/fish') || path.startsWith('/log'),
    icon: (
      <>
        <path d="M3 12c3.5-4.5 9.5-6 15-2.5L21 7v10l-3-2.5C12.5 18 6.5 16.5 3 12z" />
        <circle cx="8.5" cy="11" r="0.9" fill="currentColor" />
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

/** Tabs for the pages inside the current section (Spots, Fish or
 * Account), under the header. Nothing on single-page sections. */
export function SectionTabs() {
  const path = usePathname() ?? '/'
  const { data: session, isPending } = useSession()
  if (isPending || !session) return null
  const pages = SECTION_PAGES.find((section) => section.some((page) => page.isActive(path)))
  if (!pages) return null

  return (
    <nav aria-label="Section" className="border-b border-border bg-surface/60">
      <ul className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
        {pages.map((page) => {
          const active = page.isActive(path)
          return (
            <li key={page.href}>
              <Link
                href={page.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative block whitespace-nowrap px-3 py-2.5 text-sm font-semibold no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                  active
                    ? 'text-text after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
                    : 'text-text-muted hover:text-text',
                )}
              >
                {page.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
