/**
 * How to rig each bait so it stays on the hook and looks natural.
 * Matched against bait names and the catalogue's free-text bait lines
 * ("Cut menhaden or mullet strips; fresh shrimp; live finger mullet").
 */

export type BaitHow = { id: string; title: string; steps: string[] }

const BAITFISH =
  /mullet|menhaden|pogies|bunker|cigar|threadfin|runner|anchov|sardine|silverside|minnow|oama|halalu|opelu|akule|nehu|mackerel|pinfish|grunion|herring|ballyhoo|smelt|\bshad\b|croaker|bluegill|baitfish|pilchard|scad|\beels?\b|\blive (small )?fish\b/i

/** A whole bait that isn't alive: "whole mackerel", "fresh menhaden". */
const WHOLE = new RegExp(String.raw`\bwhole\b|\b(fresh|dead|frozen|salted)\b.*(${BAITFISH.source})`, 'i')

const RULES: { match: RegExp; how: BaitHow }[] = [
  {
    match: /fishbites/i,
    how: {
      id: 'fishbites',
      title: 'Fishbites',
      steps: ['Cut off a piece about 1 in. long and hook it through the mesh once or twice. Leave the mesh on: it’s what holds the bait on the hook.'],
    },
  },
  {
    match: /sabiki/i,
    how: {
      id: 'sabiki',
      title: 'Sabiki rig',
      steps: [
        'Clip a light sinker to the bottom, lower the rig to the bait school, and jig it slowly up and down.',
        'If the fish ignore the bare flies, put a tiny piece of shrimp or squid on each hook.',
        'The hooks tangle and catch fingers easily. When you’re done, wrap the rig around a pool noodle or its card.',
      ],
    },
  },
  {
    match: /bread|dough|rice|oatmeal/i,
    how: {
      id: 'dough',
      title: 'Bread and dough',
      steps: ['Squeeze a pea-sized ball firmly around a small hook, covering the point, so it doesn’t wash off.'],
    },
  },
  {
    match: /ghost shrimp|mud shrimp/i,
    how: {
      id: 'ghost-shrimp',
      title: 'Ghost or mud shrimp',
      steps: [
        'Run a small hook in at the tail and thread it up through the body.',
        'They’re soft, so a few wraps of bait thread keep them on when you cast.',
      ],
    },
  },
  {
    match: /live squid/i,
    how: {
      id: 'live-squid',
      title: 'Live squid',
      steps: ['Hook it once through the pointed tip of the body, the end away from the tentacles, so it can still swim.'],
    },
  },
  {
    match: /squid|\bika\b|tako|octopus/i,
    how: {
      id: 'squid',
      title: 'Squid',
      steps: [
        'Slit the body tube open and slice it lengthwise into long, narrow strips, tapered at one end.',
        'Hook a strip once through the wide end so the tail flutters. Squid is tough and stays on well.',
      ],
    },
  },
  {
    match: /shrimp|ʻ?opae/i,
    how: {
      id: 'shrimp',
      title: 'Shrimp',
      steps: [
        'Live, under a float or free-lined: hook it through the clear part of the head, under the horn. Stay clear of the dark spot inside the head. Hitting it kills the shrimp.',
        'Live, for casting or on the bottom: pinch off the tail fan, then thread the hook in through the end of the tail and out the underside.',
        'Dead: peel it, cut it to fit the hook, and thread a piece on so it covers the shank.',
      ],
    },
  },
  {
    match: /sand flea|mole crab|sand crab/i,
    how: {
      id: 'sand-flea',
      title: 'Sand fleas and sand crabs',
      steps: [
        'Hook it from the underside: in near the tail flap and out through the top of the shell.',
        'Soft-shell (freshly molted) fleas are the best bait. Females carrying orange eggs under the tail are a close second, especially for pompano.',
      ],
    },
  },
  {
    match: /fiddler/i,
    how: {
      id: 'fiddler',
      title: 'Fiddler crabs',
      steps: [
        'Push the hook in where a back leg joins the body and out through the top of the shell.',
        'Or twist off the big claw and put the hook in through the socket it leaves.',
      ],
    },
  },
  {
    match: /blue crab|crab pieces|live crabs?|\bcrabs?\b/i,
    how: {
      id: 'crab',
      title: 'Crab',
      steps: [
        'Pull off the claws, cut the body in halves or quarters, and hook through a leg socket.',
        'Small live crab (for permit, tarpon or cobia): hook it from underneath through one corner of the shell, away from the body, so it stays alive.',
      ],
    },
  },
  {
    match: /worm/i,
    how: {
      id: 'worm',
      title: 'Bloodworms and sandworms',
      steps: [
        'Hold it just behind the head, since bloodworms can bite. Thread a 1–2 in. piece onto the hook and leave a short end hanging free.',
        'They tear easily. A few wraps of bait thread make them last longer.',
      ],
    },
  },
  {
    match: /clam|mussel/i,
    how: {
      id: 'clam',
      title: 'Clams and mussels',
      steps: [
        'Use the firm foot and the meat around it, and run the hook through it several times.',
        'Wrap it with bait thread or bait elastic, or it will fly off when you cast.',
      ],
    },
  },
  {
    match: /limu|seaweed/i,
    how: {
      id: 'limu',
      title: 'Limu (seaweed)',
      steps: ['Wrap a small clump around the hook shank and tie it on with bait thread.'],
    },
  },
  {
    match: /\bcut\b|\bstrips?\b|\bchunks?\b|\bbelly\b|\bsteaks?\b|\bfillets?\b/i,
    how: {
      id: 'cut',
      title: 'Cut bait',
      steps: [
        'Cut fresh chunks or strips with the skin on, about as wide as the hook gap or a little wider.',
        'Hook it once or twice through the skin, which holds when you cast. With a circle hook, leave the point exposed.',
        'Put on a fresh piece every 15–20 minutes. Once the blood and oil wash out, it stops drawing fish.',
      ],
    },
  },
  {
    match: WHOLE,
    how: {
      id: 'whole',
      title: 'Whole dead baitfish',
      steps: [
        'Hook it up through both lips or through both eye sockets so it hangs straight and doesn’t spin on the retrieve.',
        'Cut a few slashes into its sides to put more scent in the water.',
      ],
    },
  },
  {
    match: BAITFISH,
    how: {
      id: 'baitfish',
      title: 'Live baitfish',
      steps: [
        'Through both lips, from the bottom lip up through the top: best when you’re casting, drifting or reeling slowly.',
        'Through the back, just in front of the dorsal fin and above the spine: best under a float, where it swims freely.',
        'Through the nostrils (menhaden, mackerel, runners): best for slow-trolling or live-lining from a pier.',
        'Don’t hit the spine or the brain. Keep them in an aerated bucket until you hook them.',
      ],
    },
  },
]

/** The how-to for one bait name, or null if there's nothing to say. */
export function hookFor(bait: string): BaitHow | null {
  return RULES.find((rule) => rule.match.test(bait))?.how ?? null
}

/** The how-tos for every bait in a free-text bait line, in order, once each.
 * Each segment ("Cut menhaden or mullet strips") is matched on its own. */
export function hooksFor(baitLine: string): BaitHow[] {
  const seen = new Set<string>()
  const out: BaitHow[] = []
  const parts = baitLine.split(/[;,]|\bor\b|\band\b/i)
  // "Live or frozen anchovy": the bare "Live" borrows the next part's noun.
  const STATE = /^\s*(live|fresh|frozen|dead|whole)\s*$/i
  const LEADING = /^\s*(live|fresh|frozen|dead|whole)\s+/i
  for (const [index, raw] of parts.entries()) {
    const next = parts[index + 1]
    const part = STATE.test(raw) && next ? `${raw.trim()} ${next.replace(LEADING, '')}` : raw
    // Lures, flies, trolling rigs, roe and gear (traps, pots, nets) have no
    // how-to here.
    if (/jig|plug|spoon|lure|feather|dart|soft plastic|\bfl(y|ies)\b|troll|rigged|\btraps?\b|\bpots?\b|\brings?\b|\bnets?\b|\broe\b/i.test(part)) continue
    const how = hookFor(part)
    if (how && !seen.has(how.id)) {
      seen.add(how.id)
      out.push(how)
    }
  }
  return out
}
