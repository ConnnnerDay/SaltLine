import type { RigId } from '@/lib/rigs'

/**
 * Original line-drawing diagrams of each terminal rig (lib/rigs.ts), in
 * one consistent style: main line muted, leader in primary blue,
 * hardware (swivels, hooks) in the text color, sinkers gray, beads in
 * coral, floats in amber -- every part labeled. Drawn with theme tokens,
 * so they work in light and dark. Each is `role="img"` with a plain
 * description; the tying steps beside it say the same in words.
 */

function Label({
  x,
  y,
  children,
  anchor = 'start',
}: {
  x: number
  y: number
  children: string
  anchor?: 'start' | 'middle' | 'end'
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} className="fill-text-muted text-[11.5px] font-medium">
      {children}
    </text>
  )
}

function MainLine({ d }: { d: string }) {
  return <path d={d} fill="none" strokeWidth={1.5} strokeLinecap="round" className="stroke-text-muted" />
}

function Leader({ d }: { d: string }) {
  return <path d={d} fill="none" strokeWidth={2} strokeLinecap="round" className="stroke-primary" />
}

/** Barrel swivel, horizontal from (x, y), 19 units long. */
function Swivel({ x, y, vertical = false }: { x: number; y: number; vertical?: boolean }) {
  return (
    <g transform={vertical ? `rotate(90 ${x} ${y})` : undefined}>
      <circle cx={x + 3} cy={y} r={2.8} fill="none" strokeWidth={1.6} className="stroke-text" />
      <rect x={x + 5.5} y={y - 3.2} width={8} height={6.4} rx={2} className="fill-text" />
      <circle cx={x + 16} cy={y} r={2.8} fill="none" strokeWidth={1.6} className="stroke-text" />
    </g>
  )
}

/** A J hook hanging from its eye at (x, y); about 14 wide, 33 tall. */
function Hook({ x, y }: { x: number; y: number }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round" className="stroke-text">
      <circle cx={x} cy={y} r={3} strokeWidth={1.8} />
      <path d={`M ${x} ${y + 3} V ${y + 26} a 7 7 0 0 0 14 0 V ${y + 16}`} strokeWidth={2.6} />
      <path d={`M ${x + 14} ${y + 16} l -4 5`} strokeWidth={2} />
    </g>
  )
}

/** Pyramid sinker hanging from its eye at (cx, y). */
function Pyramid({ cx, y }: { cx: number; y: number }) {
  return (
    <g>
      <circle cx={cx} cy={y} r={2.5} fill="none" strokeWidth={1.5} className="stroke-text" />
      <path d={`M ${cx} ${y + 3} L ${cx - 10} ${y + 26} H ${cx + 10} Z`} className="fill-text-muted" />
    </g>
  )
}

function Bead({ cx, cy }: { cx: number; cy: number }) {
  return <circle cx={cx} cy={cy} r={4} className="fill-accent" />
}

function Pointer({ d }: { d: string }) {
  return <path d={d} fill="none" strokeWidth={1} className="stroke-border" />
}

function FishFinder() {
  return (
    <>
      <MainLine d="M 10 50 H 150" />
      <rect x={52} y={45} width={16} height={10} rx={3} strokeWidth={1.6} className="fill-surface stroke-text" />
      <path d="M 60 55 V 70" strokeWidth={1.5} className="stroke-text" />
      <Pyramid cx={60} y={72} />
      <Bead cx={118} cy={50} />
      <Swivel x={150} y={50} />
      <Leader d="M 169 50 C 205 50 240 58 281 60" />
      <Hook x={284} y={60} />
      <Label x={10} y={38}>Main line</Label>
      <Label x={74} y={72}>Slides freely</Label>
      <Label x={118} y={38} anchor="middle">Bead</Label>
      <Label x={160} y={38} anchor="middle">Swivel</Label>
      <Label x={232} y={44} anchor="middle">18–36 in leader</Label>
      <Label x={10} y={116}>Pyramid sinker on a slide</Label>
      <Label x={286} y={114} anchor="middle">Circle hook</Label>
    </>
  )
}

function HiLo({ floats = false }: { floats?: boolean }) {
  const droppers = [60, 106]
  return (
    <>
      <MainLine d="M 110 4 V 16" />
      <Swivel x={110} y={16} vertical />
      <Leader d="M 110 35 V 142" />
      {droppers.map((y) => (
        <g key={y}>
          <Leader d={`M 110 ${y} q 26 2 46 10`} />
          {floats && <ellipse cx={146} cy={y + 7} rx={6.5} ry={4.5} className="fill-amber" />}
          <Hook x={159} y={y + 12} />
        </g>
      ))}
      <path d="M 110 142 V 148" strokeWidth={1.6} className="stroke-text" />
      <Pyramid cx={110} y={150} />
      <Label x={124} y={24}>Snap swivel to main line</Label>
      <Label x={182} y={droppers[0] + 30}>{floats ? 'Float + hook' : 'Dropper + hook'}</Label>
      <Label x={182} y={droppers[1] + 30}>{floats ? 'Float + hook' : 'Dropper + hook'}</Label>
      <Pointer d={`M 90 ${droppers[0]} H 96 M 93 ${droppers[0]} V ${droppers[1]} M 90 ${droppers[1]} H 96`} />
      <Label x={86} y={(droppers[0] + droppers[1]) / 2 + 4} anchor="end">12–18 in</Label>
      <Label x={126} y={172}>Pyramid or bank sinker</Label>
    </>
  )
}

function Knocker() {
  return (
    <>
      <MainLine d="M 10 60 H 120" />
      <Swivel x={120} y={60} />
      <Leader d="M 139 60 H 266" />
      <ellipse cx={264} cy={60} rx={13} ry={8.5} className="fill-text-muted" />
      <Hook x={280} y={60} />
      <path d="M 222 38 H 250" fill="none" strokeWidth={1.4} className="stroke-text-muted" />
      <path d="M 250 38 l -5 -3.5 v 7 Z" className="fill-text-muted" />
      <Label x={12} y={50}>Main line</Label>
      <Label x={130} y={84} anchor="middle">Swivel</Label>
      <Label x={190} y={52} anchor="middle">8–18 in leader</Label>
      <Label x={252} y={28} anchor="middle">Egg sinker slides down</Label>
      <Label x={250} y={112} anchor="middle">Rests on the hook eye</Label>
      <Pointer d="M 262 70 V 100" />
    </>
  )
}

function PoppingCork() {
  return (
    <>
      <MainLine d="M 110 4 V 24" />
      <path d="M 110 22 V 76" strokeWidth={1.6} className="stroke-text" />
      <ellipse cx={110} cy={44} rx={10} ry={20} className="fill-amber" />
      <circle cx={110} cy={70} r={3.4} className="fill-text" />
      <circle cx={110} cy={77} r={3.4} className="fill-text" />
      <Swivel x={110} y={82} vertical />
      <Leader d="M 110 101 V 136" />
      <Hook x={110} y={138} />
      <path d="M 124 160 q 10 -6 18 2 q -6 8 -16 4 Z" className="fill-accent opacity-80" />
      <Label x={130} y={40}>Popping cork</Label>
      <Label x={130} y={77}>Clacker beads</Label>
      <Label x={130} y={96}>Swivel</Label>
      <Label x={130} y={122}>18–36 in leader</Label>
      <Label x={150} y={166}>Live shrimp or small jig</Label>
    </>
  )
}

function Float() {
  return (
    <>
      <MainLine d="M 110 4 V 86" />
      <path d="M 106 14 h 8" strokeWidth={3} strokeLinecap="round" className="stroke-text" />
      <Bead cx={110} cy={21} />
      <path d="M 98 46 a 12 16 0 0 1 24 0 Z" className="fill-accent" />
      <path d="M 98 46 a 12 16 0 0 0 24 0 Z" className="fill-text" />
      <circle cx={110} cy={80} r={3.5} className="fill-text-muted" />
      <Swivel x={110} y={88} vertical />
      <path d="M 110 107 V 136" fill="none" strokeWidth={1.4} className="stroke-text" />
      <Hook x={110} y={138} />
      <Label x={124} y={17}>Bobber stop + bead</Label>
      <Label x={130} y={50}>Slip float</Label>
      <Label x={124} y={84}>Split shot</Label>
      <Label x={124} y={102}>Swivel</Label>
      <Label x={124} y={126}>Wire or fluoro leader</Label>
      <Label x={132} y={166}>Live bait</Label>
    </>
  )
}

function Jig() {
  return (
    <>
      <Leader d="M 10 52 H 128" />
      <ellipse cx={133} cy={52} rx={6} ry={4.5} fill="none" strokeWidth={1.8} className="stroke-text" />
      <path
        d="M 156 58 C 190 46 232 50 254 62 C 260 66 260 74 254 78 C 232 90 190 92 156 82 Z"
        className="fill-primary"
      />
      <ellipse cx={268} cy={70} rx={6} ry={16} className="fill-primary" />
      <circle cx={150} cy={70} r={17} className="fill-accent" />
      <path d="M 139 56 L 137 55" strokeWidth={2} className="stroke-text" />
      <path
        d="M 244 62 Q 247 40 226 41 M 226 41 l 6 5"
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-text"
      />
      <path
        d="M 30 150 q 35 -40 70 0 q 35 -40 70 0 q 35 -40 70 0"
        fill="none"
        strokeWidth={1.6}
        strokeDasharray="3 5"
        strokeLinecap="round"
        className="stroke-text-muted"
      />
      <path d="M 240 150 l -7 -2 l 3 6 Z" className="fill-text-muted" />
      <Label x={64} y={42} anchor="middle">Leader</Label>
      <Label x={133} y={36} anchor="middle">Loop knot</Label>
      <Label x={236} y={30} anchor="middle">Hook point rides up</Label>
      <Label x={150} y={106} anchor="middle">Jig head</Label>
      <Label x={222} y={106} anchor="middle">Soft plastic</Label>
      <Label x={135} y={170} anchor="middle">Lift, then let it fall</Label>
    </>
  )
}

const DESCRIPTIONS: Record<RigId, string> = {
  fish_finder:
    'Fish-finder rig: a sinker on a slide moves freely on the main line, above a bead, a swivel, a long leader and a circle hook.',
  hi_lo:
    'Hi-lo rig: a snap swivel at the top, two short droppers with hooks 12 to 18 inches apart, and a sinker at the bottom.',
  pompano:
    'Pompano rig: a hi-lo rig with a small float bead on each dropper above the hook, and a pyramid sinker at the bottom.',
  knocker:
    'Knocker rig: main line, swivel, short leader, and an egg sinker that slides down to rest on the hook eye.',
  popping_cork:
    'Popping-cork rig: a cork with clacker beads, a swivel, a fluorocarbon leader and a hook with live shrimp.',
  float:
    'Float rig: bobber stop and bead, slip float, split shot, swivel, leader and hook with live bait.',
  jig: 'Jig: a leader tied with a loop knot to a jig head with a soft plastic body, hopped along the bottom.',
}

// Every diagram sits on the same 320x180 canvas at the same scale (so
// hooks, sinkers and labels match from rig to rig), shifted so its
// drawing is centered.
const VIEWBOX: Record<RigId, string> = {
  fish_finder: '0 -16 320 180',
  hi_lo: '12 0 320 180',
  pompano: '12 0 320 180',
  knocker: '0 -22 320 180',
  popping_cork: '20 0 320 180',
  float: '20 0 320 180',
  jig: '0 8 320 180',
}

const DRAWINGS: Record<RigId, () => React.ReactNode> = {
  fish_finder: () => <FishFinder />,
  hi_lo: () => <HiLo />,
  pompano: () => <HiLo floats />,
  knocker: () => <Knocker />,
  popping_cork: () => <PoppingCork />,
  float: () => <Float />,
  jig: () => <Jig />,
}

export function RigDiagram({ id, className }: { id: RigId; className?: string }) {
  return (
    <svg viewBox={VIEWBOX[id]} role="img" aria-label={DESCRIPTIONS[id]} className={className}>
      {DRAWINGS[id]()}
    </svg>
  )
}
