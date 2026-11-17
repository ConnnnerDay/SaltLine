import type { Water } from '@/lib/fishing-style'

/**
 * "Where to fish" cross-sections, one per kind of water the profile can
 * name (lib/fishing-style.ts): a surf beach with its trough and bar, a
 * pier over the surf, a jetty, a marsh flat with its drop-off, and an
 * offshore reef. Numbered markers match `SPOTS[water].hotspots`, which
 * the "Your fishing today" card lists beside the drawing, so the
 * picture is never the only place the advice lives. Original drawings,
 * theme tokens only (water, sand, marsh), same style as rig-diagram.tsx.
 */

export const SPOTS: Record<Water, { title: string; hotspots: string[] }> = {
  surf: {
    title: 'Reading the surf',
    hotspots: [
      'The wash: pompano and whiting chase sand fleas where waves run up the beach.',
      'The first trough: the deeper slot between the beach and the bar. Red drum, flounder and whiting cruise it.',
      'Cuts in the bar: gaps where water drains back out, funneling bait. Look for darker water and flatter waves.',
      'Beyond the bar: bluefish and bigger drum. Worth a long cast when the near water is quiet.',
    ],
  },
  pier: {
    title: 'Working the pier',
    hotspots: [
      'The surf zone under the pier: pilings in breaking waves hold drum, whiting and sheepshead.',
      'Tight to the pilings: barnacles draw sheepshead. Drop a knocker rig straight down.',
      'The end of the pier: deeper water where Spanish mackerel, bluefish and kings cruise. Float or cast spoons.',
    ],
  },
  jetty: {
    title: 'Fishing the rocks',
    hotspots: [
      'Where the rocks meet the sand: flounder and drum wait on that seam for bait.',
      'Along the rock face: sheepshead and tautog pick crabs off the rocks. Fish tight with a knocker rig.',
      'The channel side: current sweeps bait along the rocks. Gamefish wait at the edge of it.',
    ],
  },
  flats: {
    title: 'Fishing the flats',
    hotspots: [
      'The grass edge: on high water, reds and trout push into the grass to feed.',
      'Oyster bars: drum and sheepshead feed on and around them. Fish the edges, not on top.',
      'The drop-off: as the tide falls, bait gets pulled off the flat and trout and flounder wait at the edge.',
    ],
  },
  offshore: {
    title: 'Fishing structure',
    hotspots: [
      'The up-current edge: fish face into the current, so anchor or drift to put baits there.',
      'Over the structure: bottom fish hold on reefs, ledges and wrecks. Drop straight down.',
      'Bait schools up in the water: kings and mackerel feed on them. Fish a float or troll around them.',
    ],
  },
}

function Marker({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} strokeWidth={2} className="fill-accent stroke-surface" />
      <text x={x} y={y + 3.6} textAnchor="middle" className="fill-white text-[10.5px] font-bold">
        {n}
      </text>
    </g>
  )
}

function Tag({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" className="fill-text-muted text-[10px] font-semibold uppercase tracking-wide">
      {children}
    </text>
  )
}

function Wave({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M ${x} ${y} q 6 -9 13 -3 q -4 1 -3 4`}
      fill="none"
      strokeWidth={1.8}
      strokeLinecap="round"
      className="stroke-text opacity-70"
    />
  )
}

function Surf() {
  return (
    <>
      <rect x={0} y={50} width={320} height={110} className="fill-water" />
      <path
        d="M 0 38 L 90 50 L 118 66 Q 150 104 176 98 Q 196 70 216 72 Q 240 112 272 114 L 320 120 V 160 H 0 Z"
        className="fill-sand"
      />
      <Wave x={98} y={50} />
      <Wave x={206} y={50} />
      <Wave x={222} y={50} />
      <Tag x={40} y={30}>Beach</Tag>
      <Tag x={216} y={150}>Bar</Tag>
      <Marker x={112} y={60} n={1} />
      <Marker x={160} y={84} n={2} />
      <Marker x={216} y={62} n={3} />
      <Marker x={268} y={98} n={4} />
    </>
  )
}

function Pier() {
  const pilings = [70, 110, 150, 190, 230, 270, 306]
  return (
    <>
      <rect x={0} y={62} width={320} height={98} className="fill-water" />
      {pilings.map((x) => (
        <rect key={x} x={x - 2.5} y={40} width={5} height={120} className="fill-text-muted" />
      ))}
      <path d="M 0 48 L 70 62 Q 160 118 320 146 V 160 H 0 Z" className="fill-sand" />
      <rect x={40} y={34} width={280} height={7} rx={1.5} className="fill-text" />
      <path d="M 40 26 H 320" strokeWidth={1.5} className="stroke-text-muted" />
      {pilings.map((x) => (
        <path key={`r${x}`} d={`M ${x} 26 V 34`} strokeWidth={1.5} className="stroke-text-muted" />
      ))}
      <Wave x={84} y={62} />
      <Wave x={124} y={62} />
      <Tag x={22} y={30}>Beach</Tag>
      <Marker x={92} y={84} n={1} />
      <Marker x={190} y={110} n={2} />
      <Marker x={290} y={80} n={3} />
    </>
  )
}

function Jetty() {
  const rocks: [number, number, number][] = [
    [128, 132, 15], [158, 134, 16], [190, 132, 15], [216, 136, 12],
    [142, 108, 14], [172, 106, 15], [200, 110, 13],
    [156, 82, 13], [184, 80, 13],
    [170, 56, 13],
  ]
  return (
    <>
      <rect x={0} y={58} width={320} height={102} className="fill-water" />
      <path d="M 0 144 Q 160 132 320 146 V 160 H 0 Z" className="fill-sand" />
      {rocks.map(([x, y, r], index) => (
        <ellipse
          key={index}
          cx={x}
          cy={y}
          rx={r}
          ry={r * 0.82}
          className={index % 2 ? 'fill-text-muted' : 'fill-text-muted opacity-75'}
        />
      ))}
      <path d="M 300 96 H 256" strokeWidth={2} strokeLinecap="round" className="stroke-text-muted" />
      <path d="M 252 96 l 8 -5 v 10 Z" className="fill-text-muted" />
      <Tag x={60} y={50}>Ocean side</Tag>
      <Tag x={278} y={50}>Channel side</Tag>
      <Tag x={278} y={116}>Current</Tag>
      <Marker x={102} y={136} n={1} />
      <Marker x={120} y={96} n={2} />
      <Marker x={238} y={120} n={3} />
    </>
  )
}

function Flats() {
  const blades = Array.from({ length: 14 }, (_, i) => 4 + i * 3.2)
  return (
    <>
      <rect x={0} y={62} width={320} height={98} className="fill-water" />
      <path d="M 0 52 L 46 60 L 62 82 L 200 88 Q 222 92 236 136 L 320 142 V 160 H 0 Z" className="fill-sand" />
      {blades.map((x, index) => (
        <path
          key={x}
          d={`M ${x} ${56 + (index % 3)} q ${index % 2 ? 3 : -3} -12 ${index % 2 ? 1 : -1} -22`}
          fill="none"
          strokeWidth={1.8}
          strokeLinecap="round"
          className="stroke-marsh"
        />
      ))}
      {[118, 127, 136, 145, 131, 140].map((x, index) => (
        <ellipse key={index} cx={x} cy={index > 3 ? 79 : 84} rx={5} ry={3} className="fill-text-muted" />
      ))}
      <Tag x={24} y={22}>Marsh</Tag>
      <Tag x={130} y={110}>Flat</Tag>
      <Tag x={282} y={130}>Channel</Tag>
      <Marker x={58} y={72} n={1} />
      <Marker x={131} y={68} n={2} />
      <Marker x={232} y={110} n={3} />
    </>
  )
}

function Offshore() {
  const bait: [number, number][] = [
    [226, 50], [234, 46], [242, 52], [250, 47], [238, 58], [256, 55], [246, 62], [230, 60], [262, 50],
  ]
  return (
    <>
      <rect x={0} y={24} width={320} height={136} className="fill-water" />
      <path d="M 0 148 L 120 146 L 132 122 L 150 116 L 176 104 L 200 112 L 214 128 L 228 146 L 320 148 V 160 H 0 Z" className="fill-text-muted opacity-80" />
      <path d="M 0 150 H 320 V 160 H 0 Z" className="fill-sand" />
      {bait.map(([x, y], index) => (
        <path key={index} d={`M ${x} ${y} l 6 -2 l 0 4 Z`} className="fill-text" />
      ))}
      <path d="M 20 80 H 70" strokeWidth={2} strokeLinecap="round" className="stroke-text-muted" />
      <path d="M 74 80 l -8 -5 v 10 Z" className="fill-text-muted" />
      <Tag x={46} y={70}>Current</Tag>
      <Tag x={272} y={140}>Reef / ledge</Tag>
      <Marker x={114} y={128} n={1} />
      <Marker x={176} y={86} n={2} />
      <Marker x={246} y={78} n={3} />
    </>
  )
}

const DRAWINGS: Record<Water, () => React.ReactNode> = {
  surf: () => <Surf />,
  pier: () => <Pier />,
  jetty: () => <Jetty />,
  flats: () => <Flats />,
  offshore: () => <Offshore />,
}

export function SpotDiagram({ water, className }: { water: Water; className?: string }) {
  return (
    <svg
      viewBox="0 0 320 160"
      role="img"
      aria-label={`${SPOTS[water].title}: a cross-section with numbered spots, described in the list beside it.`}
      className={className}
    >
      {DRAWINGS[water]()}
    </svg>
  )
}
