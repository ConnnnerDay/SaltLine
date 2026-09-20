import { ImageResponse } from 'next/og'

/**
 * iOS home-screen icon (Next's `apple-icon` file convention -- auto-adds
 * the <link rel="apple-touch-icon"> tag). 180x180 is Apple's current
 * recommended size. Deliberately no border-radius here, unlike
 * app/icon.tsx's rounded favicon tile: iOS applies its own corner mask
 * to whatever square it's given, so a source image that's already
 * rounded gets double-rounded corners in practice. Otherwise the same
 * Saltline logomark/tile as app/icon.tsx and app/icon-192/route.tsx --
 * see the latter's doc comment for why this hand-copies the markup
 * rather than sharing app/components/brand-mark.tsx.
 */
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
        }}
      >
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none">
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
    { ...size },
  )
}
