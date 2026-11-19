import { Baitfish, CRAB, HOOK, INK, Label, PAPER, Panel, Pop, RED, SAND, THREAD, WATER, ink } from './bait-art'

/**
 * More comic panels in the bait-art style, for the other how-tos:
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

/** Where to put the tape for this kind of size rule, or null. */
export function MeasureArt({ measure }: { measure: Measure }) {
  // Baitfish at (22, 30), w 130: snout x 22, tail fork x 164, tail tips x 170.
  const fish = <Baitfish x={22} y={30} w={130} />
  if (measure === 'TL') {
    return (
      <Panel label="Total length: from the tip of the closed mouth to the tip of the tail, lobes pinched together" h={116}>
        {fish}
        <path d="M176 26 l-8 8 M176 70 l-8 -8" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
        <Label x={160} y={20} text="PINCH" />
        <path d="M22 50 L22 88 M170 48 L170 88" stroke={INK} strokeWidth="1.5" strokeDasharray="3 3" />
        <Bar x1={22} x2={170} y={88} />
        <Label x={96} y={108} text="TOTAL LENGTH" />
      </Panel>
    )
  }
  if (measure === 'FL' || measure === 'LJFL') {
    return (
      <Panel label={measure === 'FL' ? 'Fork length: from the tip of the snout to the fork in the tail' : 'Lower jaw fork length: from the tip of the lower jaw to the fork in the tail'} h={116}>
        {fish}
        <path d="M22 50 L22 88 M164 48 L164 88" stroke={INK} strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx="164" cy="48" r="4" fill={RED} stroke={INK} strokeWidth="1.5" />
        <Label x={150} y={22} text="THE FORK" tx={162} ty={44} />
        <Bar x1={22} x2={164} y={88} />
        <Label x={96} y={108} text={measure === 'FL' ? 'FORK LENGTH' : 'LOWER JAW → FORK'} />
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
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${72 + i * 14} 74 l-10 16 M${128 - i * 14} 74 l10 16`} {...ink} strokeWidth={3} />
        ))}
        <path d="M40 52 C40 26 160 26 160 52 C160 76 40 76 40 52 Z" fill={CRAB} {...ink} />
        <path d="M40 50 L22 44 L40 58 Z M160 50 L178 44 L160 58 Z" fill={CRAB} {...ink} strokeWidth={2.5} />
        <Bar x1={22} x2={178} y={20} />
        <Label x={100} y={106} text="SPINE TIP → SPINE TIP" />
      </Panel>
    )
  }
  return null
}

// ---------- handling ----------

type HandleId = 'shuffle' | 'descend' | 'towel' | 'in-water' | 'snip' | 'pliers' | 'hot-water'

/** The panels that fit a handling tip, from its wording (at most two). */
export function handleArtFor(text: string): HandleId[] {
  const ids: HandleId[] = []
  if (/shuffle/i.test(text)) ids.push('shuffle')
  if (/descending device/i.test(text)) ids.push('descend')
  if (/towel/i.test(text)) ids.push('towel')
  if (/in the water|out of the water/i.test(text)) ids.push('in-water')
  if (/cut the (line|leader)/i.test(text)) ids.push('snip')
  if (/pliers|dehooker/i.test(text)) ids.push('pliers')
  if (/as hot as you can stand/i.test(text)) ids.push('hot-water')
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

function Hand({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <path d="M0 0 C0 -10 34 -12 44 -4 C50 0 48 8 40 8 L0 10 Z" fill="#f1c9a5" {...ink} strokeWidth={2.5} />
      <path d="M0 0 L-24 2 L-24 10 L0 10" fill="#7aa6c2" {...ink} strokeWidth={2.5} />
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
        <Label x={100} y={24} text="SHUFFLE, DON'T STEP!" color={RED} />
        <Label x={146} y={52} text="BYE!" />
      </>
    ),
  },
  descend: {
    label: 'Send a fish from deep water back down on a descending device',
    art: (
      <>
        <Water top={30} />
        <path d="M100 4 L100 70" stroke={INK} strokeWidth="2" />
        <Baitfish x={58} y={66} w={90} s={1} />
        <path d="M100 70 q-6 2 -8 10" fill="none" stroke={HOOK} strokeWidth="4" />
        <path d="M94 84 L106 84 L104 100 L96 100 Z" fill="#6b7280" {...ink} strokeWidth={2.5} />
        <path d="M30 54 L30 118" stroke={RED} strokeWidth="4" markerEnd="url(#bait-arrow)" />
        <Label x={100} y={128} text="SEND IT BACK DOWN" />
      </>
    ),
  },
  towel: {
    label: 'Pin a spiny fish under a towel and unhook it with pliers',
    art: (
      <>
        <Baitfish x={28} y={58} w={130} />
        <path d="M30 76 l-10 14 M34 78 l-6 16" stroke={INK} strokeWidth="2" />
        <path d="M80 40 L100 18 M48 72 L34 96" stroke={RED} strokeWidth="3" />
        <path d="M70 34 L170 46 L176 96 L76 92 Z" fill="#8ecae6" {...ink} opacity="0.92" />
        <path d="M90 50 l70 8 M88 66 l72 8 M86 82 l72 6" stroke="#5aa9cf" strokeWidth="3" />
        <Label x={100} y={124} text="PIN IT, THEN UNHOOK" />
        <Label x={46} y={20} text="SPINES!" color={RED} tx={92} ty={24} />
      </>
    ),
  },
  'in-water': {
    label: 'Keep a big fish in the water and support its belly while you unhook it',
    art: (
      <>
        <Water top={60} />
        <Baitfish x={40} y={52} w={120} />
        <Hand x={74} y={94} />
        <Hand x={136} y={96} flip />
        <Label x={100} y={28} text="KEEP IT WET" />
        <Label x={100} y={128} text="SUPPORT THE BELLY" />
      </>
    ),
  },
  snip: {
    label: 'Cut the leader close to the mouth instead of reaching for the hook',
    art: (
      <>
        <Baitfish x={70} y={50} w={100} />
        <path d="M70 68 C50 68 30 44 12 20" fill="none" stroke={INK} strokeWidth="2" />
        <g transform="translate(50 56) rotate(-40)">
          <path d="M0 0 L-28 -8 M0 0 L-28 8" stroke={HOOK} strokeWidth="5" strokeLinecap="round" />
          <circle cx="8" cy="-8" r="7" fill="none" stroke={RED} strokeWidth="4" />
          <circle cx="8" cy="8" r="7" fill="none" stroke={RED} strokeWidth="4" />
        </g>
        <Pop x={30} y={70} r={13} />
        <Label x={30} y={74} text="SNIP" />
        <Label x={100} y={128} text="CUT THE LEADER CLOSE" />
      </>
    ),
  },
  pliers: {
    label: 'Unhook toothy fish with long pliers, never your fingers',
    art: (
      <>
        <Baitfish x={58} y={44} w={108} s={1} />
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M${60 + i * 5} 58 l2 6 l2 -6`} fill="#fff" stroke={INK} strokeWidth="1.2" />
        ))}
        <path d="M60 62 L16 104 M64 66 L24 112" stroke={HOOK} strokeWidth="6" strokeLinecap="round" />
        <path d="M60 62 L16 104 M64 66 L24 112" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="40" cy="86" r="4" fill={INK} />
        <Label x={124} y={24} text="TEETH!" color={RED} tx={70} ty={58} />
        <Label x={120} y={124} text="PLIERS, NOT FINGERS" />
      </>
    ),
  },
  'hot-water': {
    label: 'If you are stung, soak it in water as hot as you can stand',
    art: (
      <>
        <path d="M50 52 L150 52 L140 124 L60 124 Z" fill="#f8f9fa" {...ink} />
        <path d="M56 68 L144 68 L138 118 L62 118 Z" fill="#ffb4a2" stroke="none" />
        {[70, 100, 130].map((x) => (
          <path key={x} d={`M${x} 46 q-8 -10 0 -18 q8 -8 0 -18`} fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        ))}
        <path d="M120 66 L120 20 C120 12 140 12 140 20 L140 70" fill="#f1c9a5" {...ink} />
        <Label x={100} y={134} text="AS HOT AS YOU CAN STAND" color={RED} />
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

