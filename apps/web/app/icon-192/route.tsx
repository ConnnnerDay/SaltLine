import { ImageResponse } from 'next/og'

// Plain Route Handlers aren't statically optimized by default the way
// the special icon.tsx/apple-icon.tsx file conventions are -- this has
// no request-time input, so force it static rather than regenerating
// the same PNG on every request.
export const dynamic = 'force-static'

/**
 * A 192x192 PNG for app/manifest.ts's icons array (the Lighthouse PWA
 * "installable" audit's minimum expected size, alongside icon-512). Not
 * one of Next's auto-linked favicon/apple-icon file conventions -- a
 * manifest needs a real, stable src URL for each size, so this is a
 * plain Route Handler returning ImageResponse rather than a special
 * `icon`-named file. Same Saltline logomark and dark-teal tile as
 * app/icon.tsx, scaled up (viewBox stays 0-24, only the rendered size
 * changes).
 */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1c4a56',
          borderRadius: 42,
        }}
      >
        <svg width="126" height="126" viewBox="0 0 24 24" fill="none">
          <path d="M2 11 L22 11" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M6 11 A6 6 0 0 1 18 11"
            stroke="#ff8552"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M2 16 Q5 14 8 16 T14 16 T20 16"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { width: 192, height: 192 },
  )
}
