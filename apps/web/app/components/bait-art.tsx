/**
 * Drawn panels for "How to hook it" (lib/hook-bait.ts): one panel per
 * step, in ink outlines and flat colors, with a red dashed arrow for the
 * hook's path and short plain labels naming the parts. The panels keep
 * their own light background in both themes so the drawings read the
 * same everywhere.
 *
 * `BAIT_ART[baitId][stepIndex]` is the drawing for that step; a step
 * without one just shows its caption.
 */

export const INK = '#1c1917'
export const PAPER = '#fffaf0'
export const HOOK = '#a8b0bb'
export const RED = '#e63946'
const SHRIMP = '#f4a582'
const SHRIMP_DARK = '#d9774f'
export const FISH = '#bcd4e6'
export const FISH_BACK = '#7d9fb8'
const MEAT = '#f2a7a0'
export const SAND = '#f3e2b3'
export const CRAB = '#e76f51'
const FIDDLER = '#d4a373'
const WORM = '#d4625a'
const CLAM = '#f5deb3'
const SQUID = '#f3e4ea'
export const GREEN = '#6a994e'
export const THREAD = '#2a7de1'
export const WATER = '#cfe8f7'

export const ink = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

/** A J hook: eye at the origin, shank straight down, point up on the right. */
export function Hook({ x, y, s = 1, r = 0 }: { x: number; y: number; s?: number; r?: number }) {
  const d = 'M0 0 L0 44 C0 64 28 64 28 44 L28 32'
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <circle cx="0" cy="-6" r="6" fill="none" stroke={INK} strokeWidth={7 / s} />
      <circle cx="0" cy="-6" r="6" fill="none" stroke={HOOK} strokeWidth={3.5 / s} />
      <path d={d} fill="none" stroke={INK} strokeWidth={8 / s} strokeLinecap="round" />
      <path d={d} fill="none" stroke={HOOK} strokeWidth={4 / s} strokeLinecap="round" />
      <path d="M28 32 L20 42" stroke={INK} strokeWidth={6 / s} strokeLinecap="round" />
      <path d="M28 32 L20 42" stroke={HOOK} strokeWidth={2.5 / s} strokeLinecap="round" />
      <path d="M2 8 L2 36" stroke="#fff" strokeWidth={1.5 / s} strokeLinecap="round" opacity="0.8" />
    </g>
  )
}

/** The hook's route: a red dashed arrow. */
export function Route({ d }: { d: string }) {
  return (
    <g>
      <path d={d} fill="none" stroke={RED} strokeWidth="3" strokeDasharray="7 5" strokeLinecap="round" markerEnd="url(#bait-arrow)" />
    </g>
  )
}

/** A shout-out label with a pointer line to (tx, ty). */
export function Label({ x, y, text, tx, ty, color = INK }: { x: number; y: number; text: string; tx?: number; ty?: number; color?: string }) {
  return (
    <g>
      {tx !== undefined && ty !== undefined && <path d={`M${x} ${y + 3} L${tx} ${ty}`} stroke={INK} strokeWidth="1.5" />}
      <text
        x={x}
        y={y}
        textAnchor="middle"
        fontSize="11"
        fontWeight="900"
        fontFamily="ui-rounded, 'Comic Sans MS', system-ui, sans-serif"
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

/** A shrimp facing right; head (horn, eye, dark spot) near x+100. */
function Shrimp({ x, y, s = 1, body = SHRIMP, dark = SHRIMP_DARK, tail = true }: { x: number; y: number; s?: number; body?: string; dark?: string; tail?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {tail && <path d="M2 30 L-18 16 L-13 30 L-18 44 Z" fill={dark} {...ink} />}
      {[46, 54, 62, 70, 78, 86].map((lx) => (
        <path key={lx} d={`M${lx} 40 l-4 12`} {...ink} strokeWidth={2} fill="none" />
      ))}
      <path d="M2 30 C10 6 70 0 100 14 C114 22 114 34 100 38 C72 48 24 50 2 30 Z" fill={body} {...ink} />
      {[28, 46, 64].map((sx) => (
        <path key={sx} d={`M${sx} 10 Q${sx + 5} 26 ${sx} 44`} fill="none" stroke={dark} strokeWidth="2" />
      ))}
      <path d="M100 14 L126 4 L106 22 Z" fill={dark} {...ink} strokeWidth={2.5} />
      <path d="M108 20 C128 10 146 16 162 4" fill="none" {...ink} strokeWidth={2} />
      <path d="M108 26 C132 26 146 34 166 28" fill="none" {...ink} strokeWidth={2} />
      <circle cx="90" cy="24" r="6" fill="#5b3a29" stroke={INK} strokeWidth="1.5" />
      <circle cx="104" cy="22" r="3.5" fill={INK} />
    </g>
  )
}

/** A baitfish facing left, mouth at (x, y+18). */
export function Baitfish({ x, y, s = 1, w = 120 }: { x: number; y: number; s?: number; w?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d={`M${w - 10} 18 L${w + 18} 0 L${w + 12} 18 L${w + 18} 36 Z`} fill={FISH_BACK} {...ink} />
      <path d={`M${w * 0.42} 4 L${w * 0.55} -12 L${w * 0.66} 3 Z`} fill={FISH_BACK} {...ink} strokeWidth={2.5} />
      <path d={`M0 18 C10 0 ${w * 0.6} -4 ${w} 18 C${w * 0.6} 40 10 36 0 18 Z`} fill={FISH} {...ink} />
      <path d={`M8 12 C${w * 0.4} 2 ${w * 0.7} 6 ${w - 4} 16`} fill="none" stroke={FISH_BACK} strokeWidth="4" opacity="0.7" />
      <path d={`M${w * 0.22} 8 Q${w * 0.28} 18 ${w * 0.22} 30`} fill="none" stroke={INK} strokeWidth="2" />
      <circle cx="14" cy="15" r="4" fill="#fff" stroke={INK} strokeWidth="2" />
      <circle cx="13" cy="15" r="2" fill={INK} />
      <path d="M0 18 L7 20" stroke={INK} strokeWidth="2" />
    </g>
  )
}

/** A chunk of cut fish: skin on top, meat below. */
function Chunk({ x, y, w = 70, h = 34, pale = false }: { x: number; y: number; w?: number; h?: number; pale?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M0 6 Q${w / 2} -6 ${w} 6 L${w - 6} ${h} Q${w / 2} ${h + 6} 6 ${h} Z`} fill={pale ? '#f1e4df' : MEAT} {...ink} />
      <path d={`M2 8 Q${w / 2} -2 ${w - 2} 8`} fill="none" stroke={pale ? '#b9c3cb' : FISH_BACK} strokeWidth="6" />
      {!pale && <path d={`M${w * 0.3} 18 q6 6 12 0 M${w * 0.55} 22 q6 6 12 0`} fill="none" stroke="#c96f66" strokeWidth="2" />}
    </g>
  )
}

function SandFlea({ x, y, s = 1, eggs = false }: { x: number; y: number; s?: number; eggs?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 26 C0 4 70 -2 86 20 C90 30 80 40 70 42 L8 42 C2 40 0 34 0 26 Z" fill={SAND} {...ink} />
      {[20, 36, 52, 66].map((sx) => (
        <path key={sx} d={`M${sx} 6 Q${sx + 4} 24 ${sx} 42`} fill="none" stroke="#c9b27a" strokeWidth="2" />
      ))}
      <path d="M0 30 L-16 26 L-14 38 L2 38 Z" fill="#e6cf91" {...ink} strokeWidth={2.5} />
      {eggs && <ellipse cx="44" cy="40" rx="20" ry="7" fill="#f4a261" {...ink} strokeWidth={2} />}
      <path d="M84 16 l12 -8 M86 22 l14 -2" {...ink} strokeWidth={2} />
    </g>
  )
}

function Fiddler({ x, y, s = 1, clawless = false }: { x: number; y: number; s?: number; clawless?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[0, 1, 2].map((i) => (
        <path key={`l${i}`} d={`M${18 + i * 8} 34 l-12 ${10 + i * 2}`} {...ink} strokeWidth={3} fill="none" />
      ))}
      {[0, 1, 2].map((i) => (
        <path key={`r${i}`} d={`M${52 - i * 8} 34 l12 ${10 + i * 2}`} {...ink} strokeWidth={3} fill="none" />
      ))}
      <path d="M6 22 C6 6 64 6 64 22 C64 36 6 36 6 22 Z" fill={FIDDLER} {...ink} />
      <path d="M24 10 l-2 -10 M46 10 l2 -10" {...ink} strokeWidth={2.5} />
      <circle cx="22" cy="0" r="3" fill={INK} />
      <circle cx="48" cy="0" r="3" fill={INK} />
      {clawless ? (
        <circle cx="66" cy="22" r="4" fill="#8a5a3c" stroke={INK} strokeWidth="2" />
      ) : (
        <path d="M62 18 C80 6 104 10 102 24 C100 34 82 36 66 28 Z" fill="#f2e2c4" {...ink} />
      )}
      <path d="M4 22 C-6 16 -10 24 -4 28" fill="#f2e2c4" {...ink} strokeWidth={2.5} />
    </g>
  )
}

function Worm({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0 C20 -16 40 16 60 0 C80 -16 100 16 120 0" fill="none" stroke={INK} strokeWidth="14" strokeLinecap="round" />
      <path d="M0 0 C20 -16 40 16 60 0 C80 -16 100 16 120 0" fill="none" stroke={WORM} strokeWidth="9" strokeLinecap="round" />
      {[16, 36, 56, 76, 96].map((sx) => (
        <path key={sx} d={`M${sx} -6 l0 10`} stroke="#a8433d" strokeWidth="1.5" />
      ))}
    </g>
  )
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

const ART: Record<string, Art[]> = {
  shrimp: [
    (label) => (
      <Panel label={label}>
        <Shrimp x={22} y={60} s={1} />
        <Hook x={126} y={34} s={0.62} />
        <Dot x={126} y={66} />
        <Dot x={143} y={57} />
        <Label x={72} y={128} text="AVOID THE DARK SPOT" tx={112} ty={88} color={RED} />
        <Label x={130} y={22} text="UNDER THE HORN" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Shrimp x={40} y={48} s={0.95} tail={false} />
        <Route d="M14 80 C40 84 62 94 96 94" />
        <Dot x={30} y={78} />
        <Dot x={98} y={88} />
        <Label x={46} y={124} text="IN: TAIL" tx={30} ty={84} />
        <Label x={142} y={124} text="OUT: UNDERSIDE" tx={100} ty={94} />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <path d="M30 40 C46 24 70 26 78 40 C70 54 46 56 30 40 Z" fill={SHRIMP} {...ink} />
        <path d="M44 30 Q48 40 44 52 M58 28 Q62 40 58 54" fill="none" stroke={SHRIMP_DARK} strokeWidth="2" />
        <path d="M84 40 l16 0" {...ink} />
        <path d="M94 34 l8 6 l-8 6" fill="none" {...ink} />
        <Hook x={140} y={28} s={0.9} />
        <path d="M128 62 C128 50 160 50 160 62 C160 76 128 76 128 62 Z" fill={SHRIMP} {...ink} />
        <Label x={56} y={84} text="PEELED" />
        <Label x={138} y={120} text="SHANK COVERED" tx={150} ty={74} />
      </Panel>
    ),
  ],
  baitfish: [
    (label) => (
      <Panel label={label}>
        <Baitfish x={56} y={52} />
        <Hook x={44} y={34} s={0.7} />
        <Route d="M30 104 C30 88 40 76 52 72" />
        <Label x={100} y={124} text="UP THROUGH BOTH LIPS" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <path d="M86 6 L86 30" {...ink} strokeWidth={2} />
        <ellipse cx="86" cy="18" rx="9" ry="12" fill={RED} {...ink} />
        <path d="M77 18 h18" stroke="#fff" strokeWidth="5" />
        <Baitfish x={36} y={70} />
        <Hook x={86} y={38} s={0.7} />
        <Label x={138} y={52} text="ABOVE THE SPINE" tx={104} ty={72} />
        <Label x={100} y={128} text="UNDER A FLOAT" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Baitfish x={56} y={56} />
        <Hook x={60} y={30} s={0.7} />
        <Dot x={62} y={66} />
        <Label x={40} y={40} text="NOSE" tx={58} ty={64} />
        <Label x={110} y={124} text="THROUGH THE NOSTRILS" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <path d="M48 36 L152 36 L140 124 L60 124 Z" fill="#f8f9fa" {...ink} />
        <path d="M54 56 L146 56 L138 118 L62 118 Z" fill={WATER} stroke="none" />
        <path d="M48 36 Q100 10 152 36" fill="none" {...ink} strokeWidth={2.5} />
        <Baitfish x={72} y={74} s={0.5} />
        <Baitfish x={92} y={92} s={0.45} />
        {[[120, 104], [126, 90], [118, 76], [128, 66]].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" fill="#fff" stroke={INK} strokeWidth="1.5" />
        ))}
        <path d="M132 112 L170 30" {...ink} strokeWidth={2.5} />
        <rect x="160" y="16" width="26" height="18" rx="3" fill="#ffd166" {...ink} strokeWidth={2.5} />
        <Label x={173} y={50} text="PUMP" />
        <Label x={64} y={26} text="AERATED BUCKET" />
      </Panel>
    ),
  ],
  cut: [
    (label) => (
      <Panel label={label}>
        <Baitfish x={34} y={46} s={1.05} />
        {[70, 98, 126].map((cx) => (
          <path key={cx} d={`M${cx} 34 L${cx - 6} 96`} stroke={RED} strokeWidth="3" strokeDasharray="6 4" />
        ))}
        <Label x={100} y={124} text="SKIN-ON CHUNKS" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Chunk x={58} y={56} w={84} h={38} />
        <Hook x={86} y={30} s={0.85} />
        <Dot x={86} y={60} />
        <Label x={62} y={24} text="THROUGH THE SKIN" tx={84} ty={56} />
        <Label x={136} y={126} text="POINT EXPOSED" tx={112} ty={66} />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <circle cx="56" cy="66" r="34" fill="#fff" {...ink} />
        <path d="M56 66 L56 42 M56 66 L72 74" {...ink} strokeWidth={3.5} />
        <path d="M56 32 v6 M90 66 h-6 M56 100 v-6 M22 66 h6" {...ink} strokeWidth={2} />
        <Chunk x={112} y={50} w={64} h={30} pale />
        <path d="M120 100 l12 0 M160 100 l12 0" {...ink} strokeWidth={2} />
        <Label x={144} y={44} text="WASHED OUT" />
        <Label x={100} y={126} text="REBAIT EVERY 15–20 MIN" />
      </Panel>
    ),
  ],
  squid: [
    (label) => (
      <Panel label={label}>
        {/* The squid's body tube (mantle) with its fins, head end cut off. */}
        <path d="M150 70 C170 50 186 60 186 70 C186 80 170 90 150 70 Z" fill={SQUID} {...ink} strokeWidth={2.5} />
        <path d="M30 52 L150 56 C172 62 184 68 186 70 C184 72 172 78 150 84 L30 88 Z" fill={SQUID} {...ink} />
        <path d="M30 52 C24 62 24 78 30 88" fill="none" {...ink} strokeWidth={2} />
        {[40, 60, 80, 100, 120].map((cx) => (
          <circle key={cx} cx={cx} cy={cx % 40 === 0 ? 64 : 76} r="2.5" fill="#c77d9b" />
        ))}
        {[62, 70, 78].map((cy) => (
          <path key={cy} d={`M28 ${cy} L170 ${cy + (70 - cy) * 0.6}`} stroke={RED} strokeWidth="2.5" strokeDasharray="6 4" />
        ))}
        <Label x={100} y={30} text="BODY TUBE, SLIT OPEN" />
        <Label x={100} y={124} text="SLICE LENGTHWISE" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <path d="M70 70 L96 64 C120 74 150 96 176 120 C140 108 112 96 96 84 Z" fill={SQUID} {...ink} />
        <Hook x={78} y={36} s={0.8} />
        <Label x={50} y={112} text="WIDE END" tx={84} ty={80} />
        <Label x={146} y={40} text="LOOSE END" tx={146} ty={98} />
      </Panel>
    ),
  ],
  'sand-flea': [
    (label) => (
      <Panel label={label}>
        <SandFlea x={46} y={48} s={1.25} />
        <Hook x={66} y={20} s={0.75} />
        <Route d="M40 116 C46 108 56 104 62 100" />
        <Label x={70} y={128} text="IN UNDER THE TAIL" />
        <Label x={150} y={30} text="OUT THE TOP" tx={98} ty={50} />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <SandFlea x={46} y={34} s={1.25} eggs />
        <Label x={150} y={30} text="SOFT SHELL" tx={120} ty={44} />
        <Label x={100} y={110} text="ORANGE EGGS" tx={98} ty={88} color={SHRIMP_DARK} />
      </Panel>
    ),
  ],
  fiddler: [
    (label) => (
      <Panel label={label}>
        <Fiddler x={44} y={52} s={1.2} />
        <Hook x={72} y={30} s={0.7} />
        <Dot x={64} y={94} />
        <Label x={56} y={128} text="BACK LEG JOINT" tx={64} ty={98} />
        <Label x={150} y={128} text="OUT THE TOP" tx={94} ty={62} />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Fiddler x={44} y={56} s={1.2} clawless />
        <path d="M150 40 C168 30 186 36 184 48 C182 58 166 58 154 52 Z" fill="#f2e2c4" {...ink} />
        <Hook x={124} y={34} s={0.6} r={20} />
        <Label x={162} y={24} text="CLAW OFF" />
        <Label x={90} y={128} text="HOOK IN THE SOCKET" />
      </Panel>
    ),
  ],
  crab: [
    (label) => (
      <Panel label={label}>
        <path d="M30 60 C30 34 96 34 96 60 L96 92 C70 104 40 100 30 92 Z" fill={CRAB} {...ink} />
        <path d="M110 60 C110 34 176 34 176 60 L176 92 C150 104 120 100 110 92 Z" fill={CRAB} {...ink} />
        <path d="M100 36 L104 104" stroke={RED} strokeWidth="3" strokeDasharray="6 4" />
        <path d="M96 64 C90 66 90 86 96 88 M110 64 C116 66 116 86 110 88" fill="#f6d5c3" {...ink} strokeWidth={2} />
        <Hook x={150} y={30} s={0.6} />
        <Label x={100} y={124} text="CLAWS OFF, CUT IN HALF" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${60 + i * 12} 90 l-8 16 M${132 - i * 12} 90 l8 16`} {...ink} strokeWidth={3} />
        ))}
        <path d="M44 72 C44 44 156 44 156 72 C156 96 44 96 44 72 Z" fill={CRAB} {...ink} />
        <path d="M44 68 L28 60 L44 78 Z M156 68 L172 60 L156 78 Z" fill={CRAB} {...ink} strokeWidth={2.5} />
        <Hook x={150} y={30} s={0.7} />
        <Dot x={152} y={64} />
        <Label x={90} y={30} text="CORNER OF THE SHELL" tx={146} ty={60} />
        <Label x={100} y={128} text="MISS THE BODY" />
      </Panel>
    ),
  ],
  worm: [
    (label) => (
      <Panel label={label}>
        <Hook x={60} y={28} s={1} />
        <path d="M60 34 L60 70 C60 86 86 86 88 72" fill="none" stroke={INK} strokeWidth="14" strokeLinecap="round" />
        <path d="M60 34 L60 70 C60 86 86 86 88 72" fill="none" stroke={WORM} strokeWidth="9" strokeLinecap="round" />
        <path d="M88 72 C96 60 112 80 124 68" fill="none" stroke={INK} strokeWidth="12" strokeLinecap="round" />
        <path d="M88 72 C96 60 112 80 124 68" fill="none" stroke={WORM} strokeWidth="7" strokeLinecap="round" />
        <Label x={146} y={44} text="THREADED ON" tx={66} ty={40} />
        <Label x={146} y={100} text="SHORT END FREE" tx={122} ty={72} />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Worm x={40} y={70} />
        {[60, 72, 84].map((cx) => (
          <path key={cx} d={`M${cx} 58 l-6 26`} stroke={THREAD} strokeWidth="2.5" />
        ))}
        <Label x={100} y={124} text="WRAPPED WITH BAIT THREAD" color={THREAD} />
      </Panel>
    ),
  ],
  clam: [
    (label) => (
      <Panel label={label}>
        <path d="M24 76 C24 40 90 40 90 76 Z" fill={CLAM} {...ink} />
        <path d="M24 76 C24 104 90 104 90 76 Z" fill={CLAM} {...ink} />
        <ellipse cx="57" cy="76" rx="20" ry="10" fill="#f6b38a" {...ink} strokeWidth={2} />
        <path d="M98 76 h14 M106 70 l8 6 l-8 6" fill="none" {...ink} />
        <Hook x={150} y={28} s={0.9} />
        <path d="M134 70 C134 58 166 58 168 70 C168 84 134 84 134 70 Z" fill="#f6b38a" {...ink} />
        <Label x={100} y={124} text="HOOK THE FIRM FOOT" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Hook x={92} y={22} s={1.1} />
        <path d="M76 64 C76 50 112 50 116 64 C116 82 76 82 76 64 Z" fill="#f6b38a" {...ink} />
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M${72 + i * 12} 52 l12 28`} stroke={THREAD} strokeWidth="3" />
        ))}
        <Label x={100} y={124} text="WRAPPED WITH BAIT THREAD" color={THREAD} />
      </Panel>
    ),
  ],
  fishbites: [
    (label) => (
      <Panel label={label}>
        <rect x="22" y="56" width="70" height="22" rx="3" fill="#ff8fab" {...ink} />
        <path d="M36 56 v22 M50 56 v22 M64 56 v22 M78 56 v22" stroke="#e0607e" strokeWidth="2" />
        <path d="M98 66 h14 M106 60 l8 6 l-8 6" fill="none" {...ink} />
        <Hook x={150} y={28} s={0.9} />
        <path d="M136 64 L164 64 L164 78 L136 78 Z" fill="#ff8fab" {...ink} />
        <Label x={60} y={44} text="1-IN. PIECE" />
        <Label x={100} y={124} text="HOOK THROUGH THE MESH" />
      </Panel>
    ),
  ],
  sabiki: [
    (label) => (
      <Panel label={label}>
        <path d="M100 8 L100 104" {...ink} strokeWidth={2} />
        {[24, 44, 64, 84].map((cy) => (
          <g key={cy}>
            <path d={`M100 ${cy} l16 6`} {...ink} strokeWidth={1.5} />
            <path d={`M116 ${cy + 6} q6 2 4 10`} fill="none" stroke={HOOK} strokeWidth="2.5" />
            <path d={`M114 ${cy + 4} l6 -4 l2 6 z`} fill="#ff6b9a" stroke={INK} strokeWidth="1" />
          </g>
        ))}
        <path d="M94 104 L106 104 L100 118 Z" fill="#6b7280" {...ink} strokeWidth={2} />
        <path d="M60 40 L60 90" stroke={RED} strokeWidth="3" markerEnd="url(#bait-arrow)" markerStart="url(#bait-arrow)" />
        <Baitfish x={140} y={54} s={0.4} />
        <Baitfish x={146} y={80} s={0.4} />
        <Label x={64} y={128} text="JIG SLOWLY" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <path d="M60 50 q20 6 16 30" fill="none" stroke={HOOK} strokeWidth="6" />
        <path d="M60 50 q20 6 16 30" fill="none" stroke={INK} strokeWidth="1.5" />
        <circle cx="76" cy="82" r="6" fill={SHRIMP} {...ink} strokeWidth={2} />
        <Label x={124} y={70} text="TINY PIECE" tx={84} ty={80} />
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
        <Hook x={96} y={24} s={0.9} />
        <circle cx="108" cy="78" r="18" fill="#f5e6c8" {...ink} />
        <path d="M100 70 q4 -4 8 0" fill="none" stroke="#c9a96e" strokeWidth="2" />
        <Label x={100} y={124} text="PEA-SIZE, SQUEEZED FIRM" />
      </Panel>
    ),
  ],
  limu: [
    (label) => (
      <Panel label={label}>
        <Hook x={96} y={22} s={0.9} />
        <path d="M90 52 C70 60 74 90 96 96 C120 100 126 70 112 56 C104 48 96 50 90 52 Z" fill={GREEN} {...ink} />
        <path d="M84 60 c-10 -8 -20 -6 -24 4 M118 70 c10 -6 20 0 22 10" fill="none" stroke={GREEN} strokeWidth="5" strokeLinecap="round" />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${86 + i * 10} 56 l8 34`} stroke={THREAD} strokeWidth="3" />
        ))}
        <Label x={100} y={124} text="TIED ON WITH THREAD" />
      </Panel>
    ),
  ],
  'ghost-shrimp': [
    (label) => (
      <Panel label={label}>
        <Shrimp x={30} y={40} s={0.95} body="#f7e1e8" dark="#e0aabb" />
        <Route d="M10 90 C40 92 80 90 116 82" />
        <Label x={100} y={124} text="IN AT THE TAIL" />
      </Panel>
    ),
    (label) => (
      <Panel label={label}>
        <Shrimp x={30} y={40} s={0.95} body="#f7e1e8" dark="#e0aabb" />
        {[54, 70, 86, 102].map((cx) => (
          <path key={cx} d={`M${cx} 46 l-6 44`} stroke={THREAD} strokeWidth="3" />
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
