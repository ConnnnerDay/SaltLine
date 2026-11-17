import Link from 'next/link'
import { BrandMark } from './brand-mark'
import { AuthStatus } from './auth-status'
import { ThemeToggle } from './theme-toggle'
import { MainNavLinks } from './main-nav'

/**
 * Persistent header, in the original Saltline style: a solid navy bar
 * (navy in both themes, like the legacy app's `header`), white
 * wordmark, light links. Rendered once from app/layout.tsx so every
 * route gets it. `AuthStatus` is the one session-dependent piece,
 * isolated into its own Client Component.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-header-border bg-header/95 text-white backdrop-blur-md">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between gap-4">
          <Link
            href="/"
            aria-label="Saltline home"
            className="flex items-center gap-2 rounded-sm text-white no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-header"
          >
            <BrandMark />
            <span className="text-[1.05rem] font-bold tracking-tight">Saltline</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-6">
            <MainNavLinks />
            <AuthStatus />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
