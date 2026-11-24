import type { Metadata } from 'next'

// The page is a Client Component, which can't export metadata itself.
export const metadata: Metadata = { title: 'Forgot password' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
