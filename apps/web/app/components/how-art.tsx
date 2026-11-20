import { Baitfish, BlueCrab, FISH, FISH_BACK, HOOK, INK, Label, PAPER, Panel, RED, SAND, THREAD, WATER, ink } from './bait-art'

/**
 * More panels in the bait-art style, for the other how-tos:
 * how to measure a fish for a size limit (`MeasureArt`), the handling
 * tips on fish pages (`HandleArt`, picked from the tip's text by
 * `handleArtFor`), and little sinker icons for "Sinker for today's water"
 * (`SinkerIcon`).
 */

// ---------- measuring ----------

type Measure = 'TL' | 'FL' | 'LJFL' | 'CFL' | 'CL' | 'CW' | 'mantle' | 'other'

function Bar({ x1, x2, y, color = RED }: { x1: number; x2: number; y: number; color?: string }) {
  return (
    <g>
      <path d={`M${x1} ${y} L${x2} ${y}`} stroke={color} strokeWidth="4" strokeLinecap="round" />
      <path d={`M${x1} ${y - 7} L${x1} ${y + 7} M${x2} ${y - 7} L${x2} ${y + 7}`} stroke={color} strokeWidth="3" strokeLinecap="round" />
    </g>
  )
}

/** A marlin side view, facing left: bill tip x 6, lower jaw tip (44, 59),
 * tall dorsal, crescent tail with its fork at (170, 53). */
function Billfish() {
  return (
    <g>
      <path d="M48 50 L6 50 L48 54 Z" fill={FISH_BACK} {...ink} strokeWidth={2} />
      <path d="M64 44 L76 26 C82 32 96 38 128 44 Z" fill={FISH_BACK} {...ink} strokeWidth={2.4} />
      <path d="M162 52 L184 26 C178 38 172 46 170 53 C172 60 178 68 184 80 L162 56 Z" fill={FISH_BACK} {...ink} strokeWidth={2.4} />
      <path d="M46 50 C70 36 124 38 162 50 L162 56 C124 66 76 68 48 60 L44 59 L50 56 Z" fill={FISH} {...ink} strokeWidth={2.6} />
      <path d="M50 48 C74 40 122 42 160 51 L161 53 C126 48 84 46 52 52 Z" fill={FISH_BACK} />
      {[84, 98, 112, 126].map((bx) => (
        <path key={bx} d={`M${bx} 46 l-2 12`} stroke={FISH_BACK} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      ))}
      <path d="M46 50 C70 36 124 38 162 50 L162 56 C124 66 76 68 48 60 L44 59 L50 56 Z" fill="none" {...ink} strokeWidth={2.6} />
      <path d="M66 57 L90 72 L82 58 Z" fill={FISH_BACK} {...ink} strokeWidth={2} />
      <path d="M62 46 C66 50 66 56 62 60" fill="none" stroke={INK} strokeWidth="1.6" />
      <circle cx="54" cy="51" r="3" fill={PAPER} stroke={INK} strokeWidth="1.5" />
      <circle cx="54.6" cy="51" r="1.4" fill={INK} />
    </g>
  )
}

/** Where to put the tape for this kind of size rule, or null. */
export function MeasureArt({ measure }: { measure: Measure }) {
  // Baitfish at (22, 30), w 130: snout x 22, tail fork x 164, tail tips x 170.
  const fish = <Baitfish x={22} y={30} w={130} />
  if (measure === 'TL') {
    return (
      <Panel label="Total length: from the tip of the closed mouth to the tip of the tail, lobes pinched together" h={116}>
        <Baitfish x={22} y={30} w={130} pinched />
        <path d="M168 28 V40 M168 68 V56" stroke={RED} strokeWidth="3" strokeLinecap="round" />
        <path d="M163 38 L168 45 L173 38 Z M163 58 L168 51 L173 58 Z" fill={RED} />
        <Label x={160} y={20} text="PINCH THE TAIL" />
        <path d="M22 50 L22 88 M178 50 L178 88" stroke={INK} strokeWidth="1.5" strokeDasharray="3 3" />
        <Bar x1={22} x2={178} y={88} />
        <Label x={96} y={108} text="TOTAL LENGTH" />
      </Panel>
    )
  }
  if (measure === 'LJFL') {
    return (
      <Panel label="Lower jaw fork length: from the tip of the lower jaw to the fork in the tail, not counting the bill" h={116}>
        <Billfish />
        <path d="M8 46 l8 8 M16 46 l-8 8" stroke={RED} strokeWidth="2.5" strokeLinecap="round" />
        <Label x={36} y={24} text="NOT THE BILL" tx={14} ty={44} color={RED} />
        <path d="M44 60 L44 88 M170 54 L170 88" stroke={INK} strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx="44" cy="59" r="3.5" fill={RED} stroke={INK} strokeWidth="1.5" />
        <circle cx="170" cy="53" r="3.5" fill={RED} stroke={INK} strokeWidth="1.5" />
        <Bar x1={44} x2={170} y={88} />
        <Label x={107} y={108} text="LOWER JAW TO FORK" />
      </Panel>
    )
  }
  if (measure === 'FL') {
    return (
      <Panel label="Fork length: from the tip of the snout to the fork in the tail" h={116}>
        {fish}
        <path d="M22 50 L22 88 M164 48 L164 88" stroke={INK} strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx="164" cy="48" r="4" fill={RED} stroke={INK} strokeWidth="1.5" />
        <Label x={150} y={22} text="THE FORK" tx={162} ty={44} />
        <Bar x1={22} x2={164} y={88} />
        <Label x={96} y={108} text="FORK LENGTH" />
      </Panel>
    )
  }
  if (measure === 'CFL') {
    return (
      <Panel label="Curved fork length: along the curve of the body, from the snout to the fork in the tail" h={116}>
        <Baitfish x={22} y={46} w={130} />
        <path d="M22 58 C60 18 130 18 164 58" fill="none" stroke={RED} strokeWidth="4" strokeLinecap="round" strokeDasharray="8 5" />
        <Label x={96} y={106} text="ALONG THE CURVE" />
      </Panel>
    )
  }
  if (measure === 'CW') {
    return (
      <Panel label="Carapace width: straight across the shell at its widest, spine tip to spine tip" h={116}>
        <BlueCrab x={100} y={60} />
        <Bar x1={44} x2={156} y={58} />
        <Label x={100} y={106} text="SPINE TIP TO SPINE TIP" />
      </Panel>
    )
  }
  return null
}

// ---------- handling ----------

type HandleId = 'shuffle' | 'descend' | 'towel' | 'snip' | 'pliers'

/** The panels that fit a handling tip, from its wording (at most two).
 * Only steps that are hard to picture get one; the towel grip is basic
 * enough that it's shown to beginners only. */
export function handleArtFor(text: string, { beginner = false }: { beginner?: boolean } = {}): HandleId[] {
  const ids: HandleId[] = []
  if (/shuffle/i.test(text)) ids.push('shuffle')
  if (/descending device/i.test(text)) ids.push('descend')
  if (beginner && /towel/i.test(text)) ids.push('towel')
  if (/cut the (line|leader)/i.test(text)) ids.push('snip')
  if (/pliers|dehooker/i.test(text) && !ids.includes('towel')) ids.push('pliers')
  return ids.slice(0, 2)
}

function Sand() {
  return <path d="M2 104 Q30 98 60 104 T120 104 T198 104 L198 138 L2 138 Z" fill={SAND} stroke={INK} strokeWidth="2.5" />
}

function Water({ top = 40 }: { top?: number }) {
  return <path d={`M2 ${top} Q26 ${top - 6} 50 ${top} T100 ${top} T150 ${top} T198 ${top} L198 138 L2 138 Z`} fill={WATER} stroke={INK} strokeWidth="2.5" />
}

function Stingray({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M40 10 C60 0 80 0 96 16 C80 28 60 32 40 22 C20 32 0 28 -16 16 C0 0 20 0 40 10 Z" fill="#b08968" {...ink} />
      <path d="M96 16 Q120 18 140 8" fill="none" {...ink} strokeWidth={2.5} />
      <path d="M126 12 l6 -8 l2 9 z" fill="#fff" stroke={RED} strokeWidth="2" />
      <circle cx="30" cy="12" r="2" fill={INK} />
      <circle cx="50" cy="12" r="2" fill={INK} />
    </g>
  )
}

function Foot({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 L12 0 L12 -30 L0 -30 Z" fill="#f1c9a5" {...ink} strokeWidth={2.5} />
      <path d="M-2 0 L30 0 C38 0 38 12 30 12 L-2 12 Z" fill="#f1c9a5" {...ink} />
    </g>
  )
}

/** Needle-nose pliers, jaws closed on (x, y) and pointing along `angle`
 * (degrees, 0 = right): long tapered jaws, a rivet, and red grips. */
function Pliers({ x, y, angle, s = 1 }: { x: number; y: number; angle: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${s})`}>
      <path d="M-34 -10 C-52 -14 -66 -16 -72 -15 M-34 10 C-52 14 -66 16 -72 15" fill="none" stroke={INK} strokeWidth="7.4" strokeLinecap="round" />
      <path d="M-34 -10 C-52 -14 -66 -16 -72 -15 M-34 10 C-52 14 -66 16 -72 15" fill="none" stroke={HOOK} strokeWidth="4.6" strokeLinecap="round" />
      <path d="M-50 -13 C-60 -15 -70 -16 -72 -15 M-50 13 C-60 15 -70 16 -72 15" fill="none" stroke={INK} strokeWidth="10" strokeLinecap="round" />
      <path d="M-50 -13 C-60 -15 -70 -16 -72 -15 M-50 13 C-60 15 -70 16 -72 15" fill="none" stroke={RED} strokeWidth="7" strokeLinecap="round" />
      <path d="M0 0 L-30 -5 C-34 -6 -38 -3 -38 0 C-38 3 -34 6 -30 5 Z" fill={HOOK} {...ink} strokeWidth={2} />
      <path d="M-2 0 L-30 0" stroke={INK} strokeWidth="1.2" />
      <path d="M-30 -5 L-34 -10 M-30 5 L-34 10" stroke={INK} strokeWidth="2" />
      <circle cx="-33" cy="0" r="3.4" fill={HOOK} stroke={INK} strokeWidth="1.8" />
    </g>
  )
}

const HANDLE: Record<HandleId, { label: string; art: React.ReactNode }> = {
  shuffle: {
    label: 'Shuffle your feet when wading so stingrays feel you coming and swim off',
    art: (
      <>
        <Sand />
        <Stingray x={112} y={84} s={0.6} />
        <path d="M150 74 l18 -10" stroke={RED} strokeWidth="3" markerEnd="url(#bait-arrow)" />
        <Foot x={34} y={100} />
        <path d="M12 96 h14 M8 90 h14 M14 84 h10" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        <Label x={100} y={24} text="SHUFFLE YOUR FEET" color={RED} />
        <Label x={138} y={52} text="RAY MOVES OFF" />
      </>
    ),
  },
  descend: {
    label: 'Send a fish from deep water back down on a descending device',
    art: (
      <>
        <Water top={30} />
        <Baitfish x={58} y={60} w={90} s={1} />
        <path d="M54 4 L54 44" stroke={INK} strokeWidth="2" />
        <path d="M47 44 L61 44 L59 60 L49 60 Z" fill="#6b7280" {...ink} strokeWidth={2.5} />
        <path d="M54 60 L54 72 C54 80 62 82 63 76" fill="none" stroke={INK} strokeWidth="4.4" strokeLinecap="round" />
        <path d="M54 60 L54 72 C54 80 62 82 63 76" fill="none" stroke={HOOK} strokeWidth="2.4" strokeLinecap="round" />
        <Label x={136} y={50} text="CLIPPED TO THE LIP" tx={66} ty={74} />
        <path d="M24 54 L24 118" stroke={RED} strokeWidth="4" markerEnd="url(#bait-arrow)" />
        <Label x={100} y={128} text="SEND IT BACK DOWN" />
      </>
    ),
  },
  towel: {
    label: 'Pin a spiny fish under a towel and unhook it with pliers',
    art: (
      <>
        <Baitfish x={28} y={56} w={130} />
        <path d="M66 38 L174 46 L180 98 L62 94 Z" fill="#8ecae6" {...ink} />
        <path d="M84 52 l76 7 M82 68 l80 7 M80 84 l80 5" stroke="#5aa9cf" strokeWidth="3" />
        <path d="M31 72 C24 72 22 80 28 82" fill="none" stroke={INK} strokeWidth="3.6" strokeLinecap="round" />
        <path d="M31 72 C24 72 22 80 28 82" fill="none" stroke={HOOK} strokeWidth="1.8" strokeLinecap="round" />
        <Pliers x={28} y={80} angle={-80} s={0.6} />
        <Label x={124} y={26} text="TOWEL OVER THE SPINES" tx={120} ty={42} />
        <Label x={110} y={124} text="PIN IT, THEN UNHOOK" />
      </>
    ),
  },
  snip: {
    label: 'Cut the leader close to the mouth instead of reaching for the hook',
    art: (
      <>
        <Baitfish x={70} y={50} w={100} />
        <path d="M70 68 C50 68 30 44 12 20" fill="none" stroke={INK} strokeWidth="2" />
        <g transform="translate(38 84) rotate(-38)">
          <path d="M0 0 L30 -8 M0 0 L30 8" stroke={INK} strokeWidth="6.4" strokeLinecap="round" />
          <path d="M0 0 L30 -8 M0 0 L30 8" stroke={HOOK} strokeWidth="4" strokeLinecap="round" />
          <path d="M0 0 L-12 -8 M0 0 L-12 8" stroke={RED} strokeWidth="4" strokeLinecap="round" />
          <circle cx="-18" cy="-10" r="6.5" fill="none" stroke={RED} strokeWidth="4" />
          <circle cx="-18" cy="10" r="6.5" fill="none" stroke={RED} strokeWidth="4" />
          <circle cx="0" cy="0" r="2" fill={INK} />
        </g>
        <Label x={100} y={128} text="CUT THE LEADER CLOSE" />
      </>
    ),
  },
  pliers: {
    label: 'Unhook toothy fish with long pliers, never your fingers',
    art: (
      <>
        <Baitfish x={58} y={44} w={108} s={1} />
        <path d="M62 60 C55 60 53 68 59 70" fill="none" stroke={INK} strokeWidth="3.6" strokeLinecap="round" />
        <path d="M62 60 C55 60 53 68 59 70" fill="none" stroke={HOOK} strokeWidth="1.8" strokeLinecap="round" />
        <Pliers x={60} y={68} angle={-36} s={0.78} />
        <Label x={124} y={24} text="SHARP TEETH" color={RED} tx={60} ty={60} />
        <Label x={120} y={124} text="USE LONG PLIERS" />
      </>
    ),
  },
}

/** The panel for a handling tip, or null. */
export function HandleArt({ id }: { id: HandleId }) {
  const entry = HANDLE[id]
  return <Panel label={entry.label}>{entry.art}</Panel>
}

// ---------- sinkers ----------

/** A little drawing of the sinker a recommendation names. */
export function SinkerIcon({ kind, className }: { kind: string; className?: string }) {
  const lead = '#8d99a6'
  const shape = /sputnik|grip/i.test(kind)
    ? 'sputnik'
    : /pyramid/i.test(kind)
      ? 'pyramid'
      : /bank/i.test(kind)
        ? 'bank'
        : /egg/i.test(kind)
          ? 'egg'
          : /split/i.test(kind)
            ? 'split'
            : null
  if (!shape) return null
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect x="1.5" y="1.5" width="45" height="45" rx="9" fill={PAPER} stroke={INK} strokeWidth="2" />
      {shape === 'pyramid' || shape === 'sputnik' ? (
        <g>
          <circle cx="24" cy="10" r="3.5" fill="none" stroke={INK} strokeWidth="2" />
          <path d="M24 13 L36 36 L12 36 Z" fill={lead} {...ink} strokeWidth={2} />
          {shape === 'sputnik' &&
            [10, 18, 30, 38].map((x) => <path key={x} d={`M${x < 24 ? 16 : 32} 36 Q${x} 40 ${x < 24 ? x - 4 : x + 4} 44`} fill="none" stroke={INK} strokeWidth="1.8" />)}
        </g>
      ) : shape === 'bank' ? (
        <g>
          <circle cx="24" cy="9" r="3.5" fill="none" stroke={INK} strokeWidth="2" />
          <path d="M24 12 C16 18 14 30 18 36 C22 42 26 42 30 36 C34 30 32 18 24 12 Z" fill={lead} {...ink} strokeWidth={2} />
        </g>
      ) : shape === 'egg' ? (
        <g>
          <path d="M24 4 L24 44" stroke={THREAD} strokeWidth="1.5" />
          <ellipse cx="24" cy="24" rx="9" ry="13" fill={lead} {...ink} strokeWidth={2} />
          <path d="M24 11 L24 37" stroke={INK} strokeWidth="1.5" strokeDasharray="2 2" />
        </g>
      ) : (
        <g>
          <path d="M4 24 L44 24" stroke={THREAD} strokeWidth="1.5" />
          <circle cx="18" cy="24" r="6" fill={lead} {...ink} strokeWidth={2} />
          <circle cx="32" cy="24" r="4.5" fill={lead} {...ink} strokeWidth={2} />
        </g>
      )}
    </svg>
  )
}

