import { ImageResponse } from 'next/og'

// See app/icon-192/route.tsx's comment: forces static optimization for
// this request-input-independent Route Handler.
export const dynamic = 'force-static'

/**
 * A 512x512 PNG for app/manifest.ts's icons array -- see app/icon-192/
 * route.tsx's doc comment for why this is a plain Route Handler rather
 * than a special `icon`-named file, and why it duplicates the logomark
 * markup instead of sharing app/components/brand-mark.tsx (Satori,
 * next/og's renderer, doesn't resolve Tailwind's `currentColor`-based
 * utility classes -- the same reason app/icon.tsx and
 * app/opengraph-image.tsx already hand-copy it with inline hex colors).
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
          borderRadius: 112,
        }}
      >
        <svg width="336" height="336" viewBox="0 0 24 24" fill="none">
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
    { width: 512, height: 512 },
  )
}
