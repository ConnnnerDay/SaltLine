/**
 * The terminal rigs the species catalogue recommends, as how-to content:
 * what each rig is, how to tie it, and how to fish it. Each species'
 * free-text `rig` (apps/api's guidance catalogue, e.g. "Fish finder rig
 * with steel leader") is matched to these by keyword (`rigsFor`), so the
 * "Rigs & tips" section can teach the rig once and list the species and
 * per-species hook/sinker under it. Diagrams: app/components/rig-diagram.tsx.
 */

export type RigId =
  | 'fish_finder'
  | 'hi_lo'
  | 'pompano'
  | 'knocker'
  | 'popping_cork'
  | 'float'
  | 'jig'

export type Rig = {
  id: RigId
  name: string
  /** One line: what it is and what it's for. */
  summary: string
  tie: string[]
  tips: string[]
  /** Main line and leader to spool and tie it with. */
  line: { main: string; leader: string }
}

export const RIGS: Record<RigId, Rig> = {
  fish_finder: {
    id: 'fish_finder',
    line: { main: '20–30 lb braid with a 40–50 lb shock leader', leader: '18–36 in of 20–30 lb fluorocarbon' },
    name: 'Fish-finder rig',
    summary:
      'A sliding sinker on the main line above a swivel and a long leader. A fish can pick up the bait and swim off without feeling the weight. With an egg sinker it is the Carolina rig.',
    tie: [
      'Put a sinker slide on the main line and clip a pyramid sinker to it, or slide on an egg sinker.',
      'Add a plastic bead so the sinker cannot chip the knot.',
      'Tie the main line to a barrel swivel with an improved clinch or Palomar knot.',
      'Tie 18–36 in of leader to the swivel. Use fluorocarbon for most fish and wire for bluefish.',
      'Finish with a circle hook, snelled or tied with a clinch knot.',
    ],
    tips: [
      'Cast past the breakers, let the sinker settle, then keep the line just snug.',
      'With a circle hook, do not jerk: when the rod loads up, reel steadily and the hook sets itself.',
      'Use a longer leader in calm, clear water and a shorter one in rough surf.',
      'Use the lightest sinker that holds bottom, and go heavier as the current picks up.',
    ],
  },
  hi_lo: {
    id: 'hi_lo',
    line: { main: '15–20 lb mono or braid', leader: '30–40 lb mono with two dropper loops' },
    name: 'Hi-lo (two-hook bottom) rig',
    summary:
      'Two short droppers, one above the other, with the sinker at the bottom. It puts two baits at two heights just off the bottom, the go-to for panfish.',
    tie: [
      'In about 3 ft of 30–40 lb mono, tie two dropper loops 12–18 in apart, or buy one made with three-way swivels.',
      'Tie a snap swivel at the top to clip onto the main line.',
      'Loop or snell a small hook (#4 to 1/0) onto each dropper.',
      'Tie a snap at the bottom for a pyramid or bank sinker.',
    ],
    tips: [
      'Use small pieces of bait. Spot, croaker and whiting have small mouths.',
      'Expect quick taps. Lift the rod smoothly rather than swinging hard.',
      'Fish the first trough and the edges of sandbars, where small fish feed.',
      'With two hooks, leave a hooked fish down for a few seconds and a second one may bite.',
    ],
  },
  pompano: {
    id: 'pompano',
    line: { main: '15–20 lb mono or braid', leader: '30–40 lb mono with two dropper loops and float beads' },
    name: 'Pompano rig',
    summary:
      'A hi-lo rig with a small foam float on each dropper. The floats lift the baits off the bottom, away from crabs, and the bright color draws strikes.',
    tie: [
      'Start with a two-dropper hi-lo rig.',
      'Thread a small orange or chartreuse float bead onto each dropper just above the hook.',
      'Use small, strong hooks (#1 to 1/0, Kahle or circle).',
      'Clip a 2–4 oz pyramid sinker to the bottom snap.',
    ],
    tips: [
      'Fish the near trough and the wash, where waves churn up sand fleas.',
      'Bait with sand fleas (mole crabs), clams or Fishbites.',
      'Rolling, sandy surf is pompano weather. Moving water beats slack water.',
      'Keep the rod in a sand spike with the line tight. Pompano hit hard and run.',
    ],
  },
  knocker: {
    id: 'knocker',
    line: { main: '30–50 lb braid', leader: '8–18 in of 30–50 lb fluorocarbon' },
    name: 'Knocker rig',
    summary:
      'An egg sinker that slides down the leader and rests on the hook eye. The bait stays pinned to structure, you feel every nibble, and it snags less than a separate sinker.',
    tie: [
      'Slide an egg sinker onto a short leader (8–18 in of fluorocarbon).',
      'Tie a strong, short-shank hook to the end, so the sinker sits against the eye.',
      'Join the leader to the main line with a barrel swivel or a double uni knot.',
    ],
    tips: [
      'Drop it straight down beside pilings, jetty rocks and bridge supports.',
      'Use the lightest sinker that reaches bottom in the current.',
      'Sheepshead and tautog nibble. Set the hook when you feel steady weight, not at the first tap.',
      'Fiddler crabs, clams and barnacle-crusted mussels are the classic baits.',
    ],
  },
  popping_cork: {
    id: 'popping_cork',
    line: { main: '15–20 lb braid', leader: '18–36 in of 15–20 lb fluorocarbon' },
    name: 'Popping-cork rig',
    summary:
      'A cork with clacking beads above a leader and a live shrimp or small jig. Popping the cork mimics feeding fish and pulls trout and reds in from a distance.',
    tie: [
      'Thread or clip a popping cork onto the main line.',
      'Tie a small swivel below it.',
      'Tie 18–36 in of fluorocarbon leader to the swivel. Set the length so the bait hangs just above the grass or bottom.',
      'Finish with a #1–1/0 hook (live shrimp) or a 1/8–1/4 oz jig head.',
    ],
    tips: [
      'Cast along grass edges, oyster bars and drop-offs.',
      'Snap the rod tip every few seconds to make the cork pop, then let it sit.',
      'When the cork ducks under, reel tight and sweep the rod. Do not wait.',
      'Moving tide and low light (dawn and dusk) are best.',
    ],
  },
  float: {
    id: 'float',
    line: { main: '15–30 lb mono or braid', leader: '12–24 in of wire or 30–50 lb fluorocarbon' },
    name: 'Float rig',
    summary:
      'A float suspends a live bait at the depth fish are feeding, then drifts it along the pier or current line. Leave off the float to free-line the bait.',
    tie: [
      'Put a bobber stop and a bead on the main line, then a slip float.',
      'Add a split shot or small egg sinker below the float to stand it upright.',
      'Tie on a swivel, then 12–24 in of leader. Use single-strand wire for Spanish mackerel and other toothy fish.',
      'Hook a live baitfish or shrimp lightly through the lips or back.',
    ],
    tips: [
      'Slide the bobber stop to set the depth; start shallow when fish are busting on top.',
      'Let the float drift with the current along the end of the pier.',
      'When it dives, reel tight before you lift. Do not yank it away from the fish.',
      'Free-line without a float when fish are right on the surface.',
    ],
  },
  jig: {
    id: 'jig',
    line: { main: '10–20 lb braid', leader: '2–3 ft of 15–30 lb fluorocarbon' },
    name: 'Jig',
    summary:
      'A weighted jig head with a soft plastic or swimbait body. Hopped along the bottom or jigged straight down over structure, it covers water fast.',
    tie: [
      'Tie the jig head to the leader with a loop knot (non-slip loop) so it swings freely.',
      'Thread the soft plastic straight onto the hook, with the point coming out of its back.',
      'Pick the lightest head that reaches bottom: 1/4 oz in shallow water, heavier in current or deep water.',
    ],
    tips: [
      'Cast, let it sink to the bottom, then lift the rod tip and let it fall back.',
      'Most bites come on the fall. Keep slack out of the line and watch it for a twitch.',
      'Over rock piles and reefs, drop it straight down and jig just off the bottom.',
      'Vary speed and color until the fish tell you what they want.',
    ],
  },
}

// Keyword -> rig. The earliest match in a species' rig text is its main
// rig; later matches are alternatives ("Hi-lo rig or fish finder rig").
const KEYWORDS: [RegExp, RigId][] = [
  [/pompano rig/i, 'pompano'],
  [/knocker/i, 'knocker'],
  [/popping[- ]cork/i, 'popping_cork'],
  [/hi-lo|dropper loop|double dropper/i, 'hi_lo'],
  [/fish ?finder|carolina|sliding (egg )?sinker|ulua setup/i, 'fish_finder'],
  [/float rig|under float|free-lined/i, 'float'],
  [/jig/i, 'jig'],
]

/** The rigs a species' rig text names, main rig first. */
export function rigsFor(rigText: string): RigId[] {
  const hits: { at: number; id: RigId }[] = []
  for (const [pattern, id] of KEYWORDS) {
    const match = pattern.exec(rigText)
    if (match && !hits.some((hit) => hit.id === id)) hits.push({ at: match.index, id })
  }
  return hits.sort((a, b) => a.at - b.at).map((hit) => hit.id)
}
