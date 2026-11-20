/**
 * Drawn panels for "How to hook it" (lib/hook-bait.ts): one panel per
 * step, in ink outlines and flat colors. A hook that goes through a bait
 * is drawn in two layers (`Through`): shank and bend behind the bait, the
 * point and barb on top where they come out, so you can see where the
 * hook goes in and where it exits. Red dashed arrows show a path; labels
 * name the parts. The panels keep their own light background in both
 * themes so the drawings read the same everywhere.
 *
 * `BAIT_ART[baitId][stepIndex]` is the drawing for that step; a step
 * without one just shows its caption.
 */

export const INK = '#1c1917'
export const PAPER = '#fffaf0'
export const HOOK = '#b4bcc6'
export const RED = '#e63946'
const SHRIMP = '#f2b49a'
const SHRIMP_LINE = '#d98466'
const GHOST = '#f5dde4'
const GHOST_LINE = '#d9a3b4'
export const FISH = '#c9dbe9'
export const FISH_BACK = '#6f93ad'
const MEAT = '#f0a49a'
const MEAT_LINE = '#c96f66'
export const SAND = '#ecdcb0'
const SAND_LINE = '#bfa772'
export const CRAB = '#e76f51'
const BLUE_CRAB = '#7f9fb8'
const BLUE_CLAW = '#4f7fb8'
const FIDDLER = '#d4a373'
const WORM = '#c9584f'
const WORM_LINE = '#9e3b35'
const CLAM = '#f5deb3'
const CLAM_MEAT = '#f4b58c'
const SQUID = '#f6e7ec'
const SQUID_SPOT = '#c77d9b'
export const GREEN = '#6a994e'
export const THREAD = '#2a7de1'
export const WATER = '#cfe8f7'

export const ink = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

// ---------- the hook ----------

// A J hook in its own units: eye at (0,0), shank down to y=32, a round
// bend, the point rising on the right to a tip at (18,12.5), the barb on
// the inside of the point, angled back down. 45 units tall at s=1.
const HOOK_BODY = 'M0 4 V32 A9 9 0 0 0 18 32 V20'
const HOOK_POINT = 'M18 30 V20'
const HOOK_TIP_Y = 12.5
const HOOK_BOTTOM_Y = 41
const HOOK_GAPE_X = 18

/** A J hook with its eye at (x, y). `only="point"` draws just the point
 * and barb, to put on top of a bait the hook goes through. */
export function Hook({ x, y, s = 1, r = 0, only }: { x: number; y: number; s?: number; r?: number; only?: 'point' }) {
  const d = only === 'point' ? HOOK_POINT : HOOK_BODY
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      {only !== 'point' && (
        <>
          <circle cx="0" cy="0" r="4" fill="none" stroke={INK} strokeWidth={4.4} />
          <circle cx="0" cy="0" r="4" fill="none" stroke={HOOK} strokeWidth={2.2} />
        </>
      )}
      <path d={d} fill="none" stroke={INK} strokeWidth={4.8} />
      <path d={d} fill="none" stroke={HOOK} strokeWidth={2.4} />
      <path d="M15.7 20.5 L18 12.5 L20.3 20.5 Z" fill={HOOK} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M16.3 19.2 L12.8 24.6 L16.3 23.3 Z" fill={HOOK} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
      {only !== 'point' && <path d="M-0.9 8 V30" stroke="#fff" strokeWidth={0.9} opacity={0.75} />}
    </g>
  )
}

/** A hook through a bait: the point comes out at (px, top), the bend sits
 * below `bottom`, and the shank runs behind the bait. The hook is sized
 * to fit (between `min` and `max` scale). `line` draws the fishing line
 * up from the eye. Children are the bait, drawn between the two layers. */
function Through({
  px,
  top,
  bottom,
  min = 0.55,
  max = 1.5,
  line = true,
  children,
}: {
  px: number
  top: number
  bottom: number
  min?: number
  max?: number
  line?: boolean
  children: React.ReactNode
}) {
  // Tip 5 above where it exits; bend 5 below where it goes in.
  const s = Math.min(max, Math.max(min, (bottom - top + 10) / (HOOK_BOTTOM_Y - HOOK_TIP_Y)))
  const hx = px - HOOK_GAPE_X * s
  const hy = top - 5 - HOOK_TIP_Y * s
  return (
    <g>
      {line && <path d={`M${hx} ${hy - 4 * s} V0`} stroke={INK} strokeWidth="1.2" />}
      <Hook x={hx} y={hy} s={s} />
      {children}
      <Hook x={hx} y={hy} s={s} only="point" />
    </g>
  )
}

/** The hook's route: a red dashed arrow. */
export function Route({ d }: { d: string }) {
  return <path d={d} fill="none" stroke={RED} strokeWidth="3" strokeDasharray="7 5" strokeLinecap="round" markerEnd="url(#bait-arrow)" />
}

/** A label with an optional pointer line to (tx, ty). */
export function Label({ x, y, text, tx, ty, color = INK }: { x: number; y: number; text: string; tx?: number; ty?: number; color?: string }) {
  // Keep the whole label inside the 200-wide panel (≈6.7 units a letter
  // at 11), shrinking a label too long to fit.
  const fontSize = Math.min(11, (184 / (text.length * 6.7)) * 11)
  const half = (text.length * 6.7 * (fontSize / 11)) / 2
  x = Math.min(Math.max(x, 8 + half), 192 - half)
  return (
    <g>
      {tx !== undefined && ty !== undefined && <path d={`M${x} ${ty < y ? y - fontSize : y + 3} L${tx} ${ty}`} stroke={INK} strokeWidth="1.5" />}
      <text
        x={x}
        y={y}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="900"
        fontFamily="ui-rounded, system-ui, sans-serif"
        fill={color}
        stroke={PAPER}
        strokeWidth="4"
        paintOrder="stroke"
        letterSpacing="0.3"
      >
        {text}
      </text>
    </g>
  )
}

export function Dot({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r="3.5" fill={RED} stroke={INK} strokeWidth="1.5" />
}

// ---------- baits ----------

/** A shrimp, side view, head to the right, in its own units (scaled by
 * `s` from (x, y)): tail fan at x≈0, the rostrum ("horn") over the head
 * from x≈100 to its tip at 146, the eye at (119,3), the dark spot
 * (stomach) inside the head at (86,4). Top of the head y≈-6, underside
 * y≈20, tail curled down to y≈30. */
function Shrimp({
  x,
  y,
  s = 1,
  body = SHRIMP,
  line = SHRIMP_LINE,
  fan = true,
  spot = true,
}: {
  x: number
  y: number
  s?: number
  body?: string
  line?: string
  fan?: boolean
  spot?: boolean
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M116 6 C140 -4 160 -2 186 -16" fill="none" {...ink} strokeWidth={1.4} />
      <path d="M116 9 C142 10 166 18 188 10" fill="none" {...ink} strokeWidth={1.4} />
      {[70, 78, 86, 94, 102].map((lx, i) => (
        <path key={lx} d={`M${lx} 18 L${lx + 4} ${29 + (i % 2)} L${lx + 8} 32`} fill="none" {...ink} strokeWidth={1.4} />
      ))}
      {[26, 36, 46, 56].map((sx) => (
        <path key={sx} d={`M${sx} ${sx < 30 ? 26 : 22} l-3 7 m3 -7 l2 7`} fill="none" {...ink} strokeWidth={1.1} />
      ))}
      {fan && (
        <g>
          <path d="M16 18 L-6 8 L-2 18 Z" fill={line} {...ink} strokeWidth={2} />
          <path d="M16 22 L-8 22 L-4 30 Z" fill={line} {...ink} strokeWidth={2} />
          <path d="M17 25 L2 36 L9 30 Z" fill={line} {...ink} strokeWidth={2} />
        </g>
      )}
      <path
        d="M16 16 C20 2 38 -8 62 -8 C82 -9 100 -7 112 -1 C121 4 124 11 117 15 C104 21 84 22 66 21 C48 21 32 25 18 31 C14 29 12 22 16 16 Z"
        fill={body}
        {...ink}
        strokeWidth={2.6}
      />
      <path d="M64 -8 C59 3 59 12 66 21" fill="none" stroke={line} strokeWidth={2} />
      {['M50 -7 C45 3 46 12 52 21', 'M38 -4 C33 6 34 14 40 22', 'M27 1 C23 9 24 17 29 24'].map((d) => (
        <path key={d} d={d} fill="none" stroke={line} strokeWidth={1.8} />
      ))}
      <path d="M100 -5 L146 -14 L112 2 Z" fill={line} {...ink} strokeWidth={1.8} />
      <path d="M114 -7 l2 -4 l2 3 M124 -10 l2 -4 l2 3 M134 -12 l2 -3 l2 3" fill="none" {...ink} strokeWidth={1.1} />
      {spot && <ellipse cx="86" cy="5" rx="6.5" ry="5" fill="#6b3f2a" opacity="0.85" />}
      <path d="M112 4 L117 3" {...ink} strokeWidth={2.2} />
      <circle cx="119" cy="3" r="3.6" fill={INK} />
      <circle cx="120" cy="2" r="1" fill="#fff" />
    </g>
  )
}

/** A baitfish, side view, head to the left: mouth at (x, y+18) (scaled),
 * body `w` long, forked tail to x+w+18. Nostril just in front of the eye
 * at (7,13.5); dorsal fin from 0.4w to 0.6w; the spine runs along y≈18.
 * `pinched` squeezes the tail lobes together into one point at x+w+26. */
export function Baitfish({ x, y, s = 1, w = 120, pinched = false }: { x: number; y: number; s?: number; w?: number; pinched?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {pinched ? (
        <>
          <path d={`M${w - 4} 14.5 C${w + 6} 10 ${w + 16} 11 ${w + 26} 17 L${w + 26} 19 C${w + 16} 25 ${w + 6} 26 ${w - 4} 21.5 Z`} fill={FISH_BACK} {...ink} strokeWidth={2.4} />
          <path d={`M${w + 2} 15 L${w + 22} 17 M${w + 2} 21 L${w + 22} 19`} fill="none" stroke="#4d7391" strokeWidth={1.1} />
          <path d={`M${w + 4} 18 L${w + 25} 18`} stroke={INK} strokeWidth={1.3} />
        </>
      ) : (
        <path d={`M${w - 4} 15 L${w + 18} 1 L${w + 12} 18 L${w + 18} 35 L${w - 4} 21 Z`} fill={FISH_BACK} {...ink} strokeWidth={2.4} />
      )}
      <path d={`M${w * 0.4} 3 L${w * 0.47} -9 L${w * 0.6} 2 Z`} fill={FISH_BACK} {...ink} strokeWidth={2} />
      <path d={`M${w * 0.68} 30 L${w * 0.74} 38 L${w * 0.82} 28 Z`} fill={FISH_BACK} {...ink} strokeWidth={1.8} />
      <path d={`M${w * 0.42} 33 L${w * 0.46} 40 L${w * 0.52} 33 Z`} fill={FISH_BACK} {...ink} strokeWidth={1.8} />
      <path
        d={`M0 18 C4 11 14 5 30 3 C${w * 0.45} 0 ${w * 0.8} 6 ${w} 15 L${w} 21 C${w * 0.8} 30 ${w * 0.45} 36 30 34 C15 32 5 25 0 18 Z`}
        fill={FISH}
        {...ink}
        strokeWidth={2.6}
      />
      <path d={`M6 12 C20 5 ${w * 0.5} 2 ${w - 2} 15`} fill="none" stroke={FISH_BACK} strokeWidth={5} strokeLinecap="round" opacity={0.75} />
      <path d={`M26 17 C${w * 0.45} 15 ${w * 0.75} 16 ${w - 2} 18`} fill="none" stroke={FISH_BACK} strokeWidth={1.2} opacity={0.8} />
      <path d="M25 6 C30 14 30 24 24 31" fill="none" {...ink} strokeWidth={1.8} />
      <path d="M31 20 L44 17 L42 24 Z" fill={FISH_BACK} {...ink} strokeWidth={1.4} />
      <path d="M0.5 18 L8 20.5" {...ink} strokeWidth={1.6} fill="none" />
      <circle cx="7" cy="13.5" r="1.2" fill={INK} />
      <circle cx="15" cy="14" r="4.6" fill="#fff" {...ink} strokeWidth={1.6} />
      <circle cx="14.2" cy="14" r="2.5" fill={INK} />
    </g>
  )
}

/** A chunk of cut fish: silver skin along the top, pink flesh with its
 * flake lines below. */
function Chunk({ x, y, w = 70, h = 34, pale = false }: { x: number; y: number; w?: number; h?: number; pale?: boolean }) {
  const flesh = pale ? '#f2e6e2' : MEAT
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M2 6 C${w * 0.3} 0 ${w * 0.7} 0 ${w - 2} 6 L${w - 7} ${h} C${w * 0.6} ${h + 4} ${w * 0.4} ${h + 4} 7 ${h} Z`} fill={flesh} {...ink} strokeWidth={2.6} />
      <path d={`M3 7 C${w * 0.3} 1 ${w * 0.7} 1 ${w - 3} 7`} fill="none" stroke={pale ? '#b9c3cb' : FISH_BACK} strokeWidth="6" strokeLinecap="round" />
      <path d={`M3 10 C${w * 0.3} 5 ${w * 0.7} 5 ${w - 3} 10`} fill="none" stroke="#e8eef3" strokeWidth="1.6" />
      {!pale &&
        [0.25, 0.45, 0.65].map((f) => (
          <path key={f} d={`M${w * f} 14 q4 5 0 9 q-4 4 0 9`} fill="none" stroke={MEAT_LINE} strokeWidth="1.4" />
        ))}
    </g>
  )
}

/** A sand flea (mole crab), side view, head to the right: an egg-shaped
 * shell from x≈2 to 92, top y≈-1, underside y≈35; the tail flap tucked
 * under the rear (x≈6-44); feathery antennae at the front. */
function SandFlea({ x, y, s = 1, eggs = false }: { x: number; y: number; s?: number; eggs?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M86 12 C94 4 100 0 108 -6 M90 14 C100 10 108 10 116 6" fill="none" {...ink} strokeWidth={1.6} />
      {[96, 102, 108].map((ax) => (
        <path key={ax} d={`M${ax} ${ax === 96 ? 2 : ax === 102 ? -1 : -4} l3 -4 M${ax + 3} ${ax === 96 ? 9 : ax === 102 ? 9 : 8} l3 -3`} fill="none" {...ink} strokeWidth={1.1} />
      ))}
      {[58, 68, 78].map((lx) => (
        <path key={lx} d={`M${lx} 32 C${lx + 2} 38 ${lx + 8} 40 ${lx + 12} 38`} fill={SAND_LINE} {...ink} strokeWidth={1.6} />
      ))}
      <path d="M2 20 C2 6 26 -2 54 -1 C74 0 90 8 91 18 C91 28 78 34 56 35 C32 36 2 33 2 20 Z" fill={SAND} {...ink} strokeWidth={2.6} />
      {['M14 2 C10 12 10 24 15 33', 'M24 -1 C20 10 20 24 25 34', 'M34 -2 C31 10 31 24 35 35'].map((d) => (
        <path key={d} d={d} fill="none" stroke={SAND_LINE} strokeWidth={1.6} />
      ))}
      <path d="M8 32 C16 40 34 41 46 36 C34 37 18 36 8 32 Z" fill="#e3cf98" {...ink} strokeWidth={1.8} />
      {eggs && <ellipse cx="50" cy="37" rx="15" ry="5" fill="#f4a261" {...ink} strokeWidth={1.8} />}
      <circle cx="86" cy="10" r="1.8" fill={INK} />
    </g>
  )
}

/** A blue crab from above, centered on (x, y): carapace with its long
 * side spines at x=±56, blue claws forward, swimming paddles at the back. */
export function BlueCrab({ x, y, s = 1, clawless = false }: { x: number; y: number; s?: number; clawless?: boolean }) {
  const side = (m: 1 | -1) => (
    <g key={m} transform={`scale(${m} 1)`}>
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${24 + i * 6} ${6 + i * 3} L${44 + i * 4} ${14 + i * 5} L${52 + i * 3} ${24 + i * 5}`} fill="none" {...ink} strokeWidth={2.6} />
      ))}
      <path d="M16 14 L28 26" {...ink} strokeWidth={2.6} />
      <ellipse cx="31" cy="30" rx="6" ry="4" transform="rotate(40 31 30)" fill={BLUE_CLAW} {...ink} strokeWidth={1.8} />
      {!clawless && (
        <>
          <path d="M18 -12 L38 -18 L46 -28" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18 -12 L38 -18 L46 -28" fill="none" stroke={BLUE_CLAW} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M40 -30 C38 -40 42 -50 48 -54 L48 -44 L54 -52 C58 -46 56 -34 50 -28 Z" fill={BLUE_CLAW} {...ink} strokeWidth={1.8} />
          <path d="M48 -53 l-1 4 M54 -51 l-2 3" stroke="#c0392b" strokeWidth={2} />
        </>
      )}
    </g>
  )
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {side(1)}
      {side(-1)}
      <path
        d="M-56 -2 L-36 -6 C-30 -14 -18 -18 0 -18 C18 -18 30 -14 36 -6 L56 -2 L34 4 C26 14 14 18 0 18 C-14 18 -26 14 -34 4 Z"
        fill={BLUE_CRAB}
        {...ink}
        strokeWidth={2.6}
      />
      <path d="M-14 -17 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3" fill="none" {...ink} strokeWidth={1.2} />
      <path d="M-30 -2 C-16 -8 16 -8 30 -2" fill="none" stroke="#5f7f99" strokeWidth={1.4} />
      <circle cx="-8" cy="-19" r="2" fill={INK} />
      <circle cx="8" cy="-19" r="2" fill={INK} />
    </g>
  )
}

/** A fiddler crab, front view, centered on (x, y): square shell, eyes on
 * long stalks, one big claw on the right (unless `clawless`, which shows
 * the socket it leaves). Back legs reach out to x≈±36, y≈18. */
function Fiddler({ x, y, s = 1, clawless = false }: { x: number; y: number; s?: number; clawless?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <path d={`M-18 ${-2 + i * 4} L-30 ${2 + i * 5} L-36 ${12 + i * 4}`} fill="none" {...ink} strokeWidth={2.4} />
          <path d={`M18 ${-2 + i * 4} L30 ${2 + i * 5} L36 ${12 + i * 4}`} fill="none" {...ink} strokeWidth={2.4} />
        </g>
      ))}
      <path d="M-22 -8 C-22 -16 22 -16 22 -8 L18 10 C10 14 -10 14 -18 10 Z" fill={FIDDLER} {...ink} strokeWidth={2.6} />
      <path d="M-6 -14 L-8 -26 M6 -14 L8 -26" {...ink} strokeWidth={2.2} />
      <circle cx="-8" cy="-27" r="2.6" fill={INK} />
      <circle cx="8" cy="-27" r="2.6" fill={INK} />
      <path d="M-20 -4 L-28 -10 L-30 -4 L-24 -2 Z" fill="#f2e2c4" {...ink} strokeWidth={1.6} />
      {clawless ? (
        <circle cx="22" cy="-5" r="3.2" fill="#8a5a3c" stroke={INK} strokeWidth={1.6} />
      ) : (
        <path d="M20 -6 C30 -14 54 -18 60 -10 C64 -4 56 2 48 0 L58 4 C50 10 34 8 22 2 Z" fill="#f2e2c4" {...ink} strokeWidth={2.2} />
      )}
    </g>
  )
}

/** A bloodworm along a path: thick red body with ring marks. */
function WormPath({ d, rings = [] as [number, number][] }: { d: string; rings?: [number, number][] }) {
  return (
    <g>
      <path d={d} fill="none" stroke={INK} strokeWidth="13" strokeLinecap="round" />
      <path d={d} fill="none" stroke={WORM} strokeWidth="9" strokeLinecap="round" />
      {rings.map(([rx, ry]) => (
        <path key={`${rx}-${ry}`} d={`M${rx - 3} ${ry - 4} l2 8`} stroke={WORM_LINE} strokeWidth="1.3" />
      ))}
    </g>
  )
}

/** A strip of squid: pale, spotted, wide at the left end, tapering right. */
function SquidStrip({ d }: { d: string }) {
  return <path d={d} fill={SQUID} {...ink} strokeWidth={2.4} />
}

export function Panel({ children, label, h = 140 }: { children: React.ReactNode; label: string; h?: number }) {
  return (
    <svg viewBox={`0 0 200 ${h}`} role="img" aria-label={label} className="block h-auto w-full">
      <defs>
        <marker id="bait-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill={RED} />
        </marker>
        <pattern id="bait-dots" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="#f0e2c4" />
        </pattern>
      </defs>
      <rect x="2" y="2" width="196" height={h - 4} rx="10" fill={PAPER} />
      <rect x="2" y="2" width="196" height={h - 4} rx="10" fill="url(#bait-dots)" />
      {children}
      <rect x="2" y="2" width="196" height={h - 4} rx="10" fill="none" stroke={INK} strokeWidth="3" />
    </svg>
  )
}

type Art = (label: string) => React.ReactNode

// Shrimp in panels: x=18, y=60, s=0.8 keeps the tail fan and antennae
// inside the panel; sx/sy map the shrimp's own units to the panel.
const SX = 18
const SY = 60
const SS = 0.8
const sx = (v: number) => SX + v * SS
const sy = (v: number) => SY + v * SS

const ART: Record<string, Art[]> = {
  shrimp: [
    (label) => (
      <Panel label={label}>
        <Through px={sx(104)} top={sy(-6)} bottom={sy(19)}>
          <Shrimp x={SX} y={SY} s={SS} />
        </Through>
        <Label x={156} y={26} text="UNDER THE HORN" tx={sx(110)} ty={sy(-8)} />
        <Label x={60} y={126} text="MISS THE DARK SPOT" tx={sx(86)} ty={sy(8)} color={RED} />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Shrimp x={30} y={56} s={0.85} fan={false} />
        <path d="M30 64 l-8 -8 M28 72 l-9 2 M30 80 l-6 8" stroke={INK} strokeWidth="1.6" strokeDasharray="2 2" />
        <Route d="M10 70 C30 70 48 72 70 80" />
        <Dot x={74} y={80} />
        <Label x={36} y={34} text="FAN OFF" tx={24} ty={60} />
        <Label x={40} y={124} text="IN: TAIL END" tx={22} ty={72} />
        <Label x={136} y={124} text="OUT: UNDERSIDE" tx={76} ty={84} />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <path d="M22 46 C26 30 52 26 66 34 C76 40 74 52 64 56 C54 60 40 58 30 62 C24 64 18 56 22 46 Z" fill="#f7c4ad" {...ink} strokeWidth={2.4} />
        {['M34 34 C30 42 31 52 36 60', 'M46 31 C42 40 43 50 48 58', 'M58 32 C54 40 55 48 60 55'].map((d) => (
          <path key={d} d={d} fill="none" stroke={SHRIMP_LINE} strokeWidth={1.6} />
        ))}
        <path d="M84 46 h14 M92 40 l7 6 l-7 6" fill="none" {...ink} />
        <Hook x={132} y={26} s={1.5} />
        <path d="M128 40 C122 52 124 70 132 80 C138 86 146 88 152 82" fill="none" stroke={INK} strokeWidth="14" strokeLinecap="round" />
        <path d="M128 40 C122 52 124 70 132 80 C138 86 146 88 152 82" fill="none" stroke="#f7c4ad" strokeWidth="10" strokeLinecap="round" />
        <Hook x={132} y={26} s={1.5} only="point" />
        <Label x={46} y={84} text="PEELED PIECE" />
        <Label x={150} y={120} text="SHANK COVERED" tx={140} ty={88} />
      </Panel>
    ),
  ],
  baitfish: [
    (label) => (
      <Panel label={label}>
        <Through px={61} top={63} bottom={74} min={1.15}>
          <Baitfish x={58} y={50} s={1} w={112} />
        </Through>
        <Label x={130} y={30} text="LOWER LIP, OUT THE TOP" />
        <Label x={100} y={126} text="THROUGH BOTH LIPS" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <path d="M86 4 V22" stroke={INK} strokeWidth="1.2" />
        <ellipse cx="86" cy="18" rx="8" ry="11" fill={RED} {...ink} strokeWidth={2} />
        <path d="M78 18 h16" stroke="#fff" strokeWidth="4" />
        <Through px={86} top={58} bottom={66} min={1.15} line={false}>
          <path d="M86 29 V48" stroke={INK} strokeWidth="1.2" />
          <Baitfish x={30} y={56} s={1} w={128} />
        </Through>
        <Label x={152} y={44} text="IN FRONT OF THE FIN" tx={100} ty={58} />
        <Label x={100} y={126} text="ABOVE THE SPINE" tx={92} ty={70} />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Through px={62} top={64} bottom={70} min={1.1}>
          <Baitfish x={54} y={50} s={1} w={116} />
        </Through>
        <Label x={36} y={46} text="NOSTRILS" tx={60} ty={64} />
        <Label x={124} y={124} text="IN ONE, OUT THE OTHER" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <path d="M44 34 L156 34 L144 124 L56 124 Z" fill="#f8f9fa" {...ink} />
        <path d="M50 52 L150 52 L141 118 L59 118 Z" fill={WATER} stroke="none" />
        <path d="M44 34 Q100 14 156 34" fill="none" {...ink} strokeWidth={2.5} />
        <Baitfish x={66} y={66} s={0.5} w={90} />
        <Baitfish x={92} y={88} s={0.45} w={90} />
        {[
          [124, 104],
          [130, 92],
          [122, 80],
          [132, 68],
          [126, 58],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.5" fill="#fff" stroke={INK} strokeWidth="1.4" />
        ))}
        <path d="M128 112 L128 40 C128 30 160 30 168 34" fill="none" stroke={INK} strokeWidth="2.5" />
        <rect x="164" y="26" width="26" height="18" rx="3" fill="#ffd166" {...ink} strokeWidth={2.5} />
        <Label x={176} y={58} text="PUMP" />
        <Label x={96} y={22} text="AERATED BUCKET" />
      </Panel>
    ),
  ],
  cut: [
    (label) => (
      <Panel label={label}>
        <Baitfish x={30} y={44} s={1.05} w={124} />
        {[66, 94, 122].map((cx) => (
          <path key={cx} d={`M${cx} 32 L${cx - 4} 96`} stroke={RED} strokeWidth="3" strokeDasharray="6 4" />
        ))}
        <Label x={100} y={124} text="SKIN-ON CHUNKS" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Through px={104} top={54} bottom={66} min={1.35} max={1.5}>
          <Chunk x={60} y={50} w={84} h={40} />
        </Through>
        <Label x={52} y={30} text="IN AND OUT THE SKIN" tx={86} ty={54} />
        <Label x={150} y={124} text="POINT EXPOSED" tx={112} ty={38} />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <circle cx="56" cy="66" r="34" fill="#fff" {...ink} />
        <path d="M56 66 L56 42 M56 66 L72 74" {...ink} strokeWidth={3.5} />
        <path d="M56 32 v6 M90 66 h-6 M56 100 v-6 M22 66 h6" {...ink} strokeWidth={2} />
        <Chunk x={112} y={50} w={64} h={30} pale />
        <Label x={144} y={42} text="WASHED OUT" />
        <Label x={100} y={126} text="REBAIT EVERY 15–20 MIN" />
      </Panel>
    ),
  ],
  squid: [
    (label) => (
      <Panel label={label}>
        <path d="M150 70 C170 48 188 60 188 70 C188 80 170 92 150 70 Z" fill={SQUID} {...ink} strokeWidth={2.4} />
        <path d="M24 52 L150 56 C172 62 184 68 186 70 C184 72 172 78 150 84 L24 88 Z" fill={SQUID} {...ink} />
        <path d="M24 52 C18 62 18 78 24 88" fill="none" {...ink} strokeWidth={2} />
        {[40, 60, 80, 100, 120, 136].map((cx, i) => (
          <circle key={cx} cx={cx} cy={i % 2 ? 76 : 64} r="2.4" fill={SQUID_SPOT} />
        ))}
        {[62, 70, 78].map((cy) => (
          <path key={cy} d={`M22 ${cy} L172 ${cy + (70 - cy) * 0.6}`} stroke={RED} strokeWidth="2.5" strokeDasharray="6 4" />
        ))}
        <Label x={100} y={34} text="BODY TUBE, SLIT OPEN" />
        <Label x={100} y={124} text="SLICE LENGTHWISE" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Through px={58} top={60} bottom={70} min={1.25}>
          <SquidStrip d="M40 58 L66 56 C100 66 140 86 182 110 C140 98 100 86 66 76 L40 74 Z" />
          {[60, 84, 108, 132].map((cx, i) => (
            <circle key={cx} cx={cx} cy={66 + i * 7} r="2" fill={SQUID_SPOT} />
          ))}
        </Through>
        <Label x={40} y={112} text="WIDE END" tx={50} ty={76} />
        <Label x={150} y={60} text="LOOSE TAIL" tx={160} ty={96} />
      </Panel>
    ),
  ],
  'sand-flea': [
    (label) => (
      <Panel label={label}>
        <Through px={58} top={47} bottom={83} min={1} max={1.6} line={false}>
          <SandFlea x={36} y={48} s={1.1} />
        </Through>
        <Route d="M70 120 C66 110 62 100 60 92" />
        <Label x={128} y={124} text="IN NEAR THE TAIL FLAP" tx={76} ty={90} />
        <Label x={148} y={30} text="OUT THROUGH THE TOP" tx={66} ty={40} />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <SandFlea x={40} y={40} s={1.2} eggs />
        <Label x={150} y={26} text="SOFT SHELL" tx={120} ty={44} />
        <Label x={100} y={116} text="ORANGE EGGS" tx={98} ty={92} color={SHRIMP_LINE} />
      </Panel>
    ),
  ],
  fiddler: [
    (label) => (
      <Panel label={label}>
        <Through px={92} top={56} bottom={84} min={0.9} max={1.3}>
          <Fiddler x={100} y={74} s={1.3} />
        </Through>
        <Dot x={72} y={86} />
        <Label x={48} y={120} text="IN AT A BACK LEG" tx={70} ty={90} />
        <Label x={152} y={30} text="OUT THE TOP" tx={96} ty={48} />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Through px={127} top={62} bottom={72} min={0.8} max={1}>
          <Fiddler x={98} y={74} s={1.3} clawless />
        </Through>
        <path d="M150 34 C162 26 184 24 188 32 C190 38 182 42 176 40 L186 44 C180 50 166 48 154 42 Z" fill="#f2e2c4" {...ink} strokeWidth={2} />
        <Label x={170} y={62} text="CLAW OFF" />
        <Label x={96} y={126} text="HOOK IN THE SOCKET" />
      </Panel>
    ),
  ],
  crab: [
    (label) => (
      <Panel label={label}>
        <g transform="translate(-4 0)">
          <path d="M40 46 L94 46 L94 92 L46 92 C30 86 26 60 40 46 Z" fill="#f6d5c3" {...ink} strokeWidth={2.6} />
          <path d="M108 46 L162 46 C176 60 172 86 156 92 L108 92 Z" fill="#f6d5c3" {...ink} strokeWidth={2.6} />
          {[54, 64, 74, 84].map((cy) => (
            <g key={cy}>
              <circle cx="40" cy={cy} r="3" fill="#c97b63" stroke={INK} strokeWidth="1.2" />
              <circle cx="162" cy={cy} r="3" fill="#c97b63" stroke={INK} strokeWidth="1.2" />
            </g>
          ))}
          <path d="M58 54 L84 54 M58 66 L84 66 M58 78 L84 78 M118 54 L144 54 M118 66 L144 66 M118 78 L144 78" stroke="#e5ad97" strokeWidth="2" />
          <path d="M101 34 L101 104" stroke={RED} strokeWidth="3" strokeDasharray="6 4" />
        </g>
        <Label x={100} y={26} text="TOP SHELL AND CLAWS OFF" />
        <Label x={100} y={124} text="CUT IN HALF, HOOK A LEG HOLE" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Through px={146} top={60} bottom={68} min={0.8} max={1}>
          <BlueCrab x={96} y={66} s={1.05} />
        </Through>
        <Label x={100} y={126} text="HOOK A SHELL POINT, MISS THE BODY" />
      </Panel>
    ),
  ],
  worm: [
    (label) => (
      <Panel label={label}>
        <Hook x={64} y={22} s={1.7} />
        <WormPath d="M64 36 V74 A15 15 0 0 0 82 84" rings={[[64, 44], [64, 54], [64, 64], [70, 82]]} />
        <WormPath d="M82 84 C94 80 104 92 118 86" rings={[[96, 84], [108, 88]]} />
        <Hook x={64} y={22} s={1.7} only="point" />
        <Label x={146} y={40} text="THREADED ON" tx={70} ty={46} />
        <Label x={150} y={116} text="SHORT END FREE" tx={116} ty={88} />
        <Label x={50} y={126} text="HOLD BEHIND THE HEAD" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <WormPath d="M36 70 C56 54 76 86 100 70 C124 54 144 86 166 70" rings={[[48, 64], [80, 74], [118, 64], [150, 76]]} />
        {[62, 76, 90, 104].map((cx) => (
          <path key={cx} d={`M${cx} 56 l-6 30`} stroke={THREAD} strokeWidth="2.5" />
        ))}
        <Label x={100} y={124} text="WRAPPED WITH BAIT THREAD" color={THREAD} />
      </Panel>
    ),
  ],
  clam: [
    (label) => (
      <Panel label={label}>
        <path d="M22 76 C22 42 88 42 88 76 Z" fill={CLAM} {...ink} />
        <path d="M22 76 C22 104 88 104 88 76 Z" fill={CLAM} {...ink} />
        <path d="M32 60 C44 52 66 52 78 60 M30 90 C44 98 66 98 80 90" fill="none" stroke="#d9c094" strokeWidth="1.6" />
        <path d="M40 76 C40 68 70 66 74 74 C76 82 60 86 46 84 C40 82 40 78 40 76 Z" fill={CLAM_MEAT} {...ink} strokeWidth={2} />
        <path d="M94 76 h14 M102 70 l7 6 l-7 6" fill="none" {...ink} />
        <Through px={160} top={64} bottom={84} min={1} max={1.3}>
          <path d="M126 74 C126 62 168 60 170 72 C172 86 130 90 126 74 Z" fill={CLAM_MEAT} {...ink} />
        </Through>
        <Label x={100} y={124} text="THREAD ON THE FIRM FOOT" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Through px={110} top={62} bottom={80} min={1.1} max={1.4}>
          <path d="M74 70 C74 56 118 54 120 68 C122 84 78 88 74 70 Z" fill={CLAM_MEAT} {...ink} />
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M${76 + i * 11} 56 l10 30`} stroke={THREAD} strokeWidth="2.6" />
          ))}
        </Through>
        <Label x={100} y={124} text="WRAPPED WITH BAIT THREAD" color={THREAD} />
      </Panel>
    ),
  ],
  fishbites: [
    (label) => (
      <Panel label={label}>
        <rect x="18" y="58" width="66" height="22" rx="3" fill="#ff8fab" {...ink} />
        <path d="M18 64 h66 M18 70 h66 M18 76 h66 M30 58 v22 M44 58 v22 M58 58 v22 M72 58 v22" stroke="#e0607e" strokeWidth="1.2" />
        <path d="M92 68 h14 M100 62 l7 6 l-7 6" fill="none" {...ink} />
        <Through px={158} top={62} bottom={76} min={1} max={1.3}>
          <rect x="130" y="60" width="38" height="18" rx="2" fill="#ff8fab" {...ink} />
          <path d="M130 66 h38 M130 72 h38 M140 60 v18 M152 60 v18" stroke="#e0607e" strokeWidth="1.2" />
        </Through>
        <Label x={52} y={46} text="1-IN. PIECE" />
        <Label x={100} y={124} text="HOOK THROUGH THE MESH" />
      </Panel>
    ),
  ],
  sabiki: [
    (label) => (
      <Panel label={label}>
        <path d="M100 6 L100 104" {...ink} strokeWidth={1.6} />
        {[22, 42, 62, 82].map((cy) => (
          <g key={cy}>
            <path d={`M100 ${cy} l12 4`} {...ink} strokeWidth={1.2} />
            <Hook x={112} y={cy + 4} s={0.32} />
            <path d={`M110 ${cy + 6} l7 -3 l1 6 z`} fill="#ff6b9a" stroke={INK} strokeWidth="1" />
          </g>
        ))}
        <path d="M94 104 L106 104 L100 118 Z" fill="#6b7280" {...ink} strokeWidth={2} />
        <path d="M60 40 L60 90" stroke={RED} strokeWidth="3" markerEnd="url(#bait-arrow)" markerStart="url(#bait-arrow)" />
        <Baitfish x={140} y={50} s={0.4} w={90} />
        <Baitfish x={146} y={76} s={0.4} w={90} />
        <Label x={56} y={128} text="JIG SLOWLY" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Through px={84} top={70} bottom={78} min={1} max={1.2} line={false}>
          <path d="M60 30 C60 40 66 50 66 54" stroke={INK} strokeWidth="1.2" fill="none" />
          <ellipse cx="84" cy="74" rx="6" ry="5" fill={SHRIMP} {...ink} strokeWidth={1.8} />
        </Through>
        <Label x={140} y={70} text="TINY PIECE" tx={92} ty={74} />
        <Label x={100} y={124} text="ON EVERY HOOK" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <rect x="40" y="56" width="120" height="30" rx="15" fill="#ffd166" {...ink} />
        {[60, 80, 100, 120, 140].map((cx) => (
          <path key={cx} d={`M${cx} 50 L${cx + 6} 92`} stroke={INK} strokeWidth="1.5" />
        ))}
        <Label x={100} y={40} text="POOL NOODLE" />
        <Label x={100} y={124} text="WRAP IT UP TO STORE" />
      </Panel>
    ),
  ],
  dough: [
    (label) => (
      <Panel label={label}>
        <path d="M86 18 V2" stroke={INK} strokeWidth="1.2" />
        <Hook x={86} y={22} s={1.4} />
        <circle cx="99" cy="62" r="24" fill="#f5e6c8" {...ink} />
        <path d="M88 52 q4 -4 8 0 M104 70 q4 -3 7 1 M92 74 q3 -2 6 0" fill="none" stroke="#c9a96e" strokeWidth="2" />
        <Label x={100} y={124} text="PEA-SIZE, POINT COVERED" />
      </Panel>
    ),
  ],
  limu: [
    (label) => (
      <Panel label={label}>
        <Hook x={92} y={22} s={1.4} />
        <path d="M86 52 C66 60 70 90 92 96 C116 100 122 70 108 56 C100 48 92 50 86 52 Z" fill={GREEN} {...ink} />
        <path d="M80 60 c-10 -8 -20 -6 -24 4 M114 70 c10 -6 20 0 22 10" fill="none" stroke={GREEN} strokeWidth="5" strokeLinecap="round" />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${82 + i * 10} 56 l8 34`} stroke={THREAD} strokeWidth="3" />
        ))}
        <Label x={100} y={124} text="TIED ON WITH THREAD" />
      </Panel>
    ),
  ],
  'ghost-shrimp': [
    (label) => (
      <Panel label={label}>
        <Shrimp x={22} y={52} s={0.8} body={GHOST} line={GHOST_LINE} spot={false} />
        <Route d="M8 82 C34 84 66 82 96 74" />
        <Label x={100} y={124} text="IN AT THE TAIL, UP THE BODY" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Shrimp x={22} y={52} s={0.8} body={GHOST} line={GHOST_LINE} spot={false} />
        {[48, 62, 76, 90].map((cx) => (
          <path key={cx} d={`M${cx} 42 l-6 38`} stroke={THREAD} strokeWidth="3" />
        ))}
        <Label x={100} y={124} text="WRAPPED WITH BAIT THREAD" color={THREAD} />
      </Panel>
    ),
  ],
}

/** Whether a step of a bait how-to has a drawing. */
export function hasBaitArt(id: string, step: number): boolean {
  return Boolean(ART[id]?.[step])
}

/** The drawn panel for one step of a bait how-to, or null. */
export function BaitArt({ id, step, label }: { id: string; step: number; label: string }) {
  const art = ART[id]?.[step]
  return art ? <>{art(label)}</> : null
}
