/**
 * How to put a bait on the hook so it stays on and looks right: live
 * shrimp under the horn, baitfish through the lips or the back, sand fleas
 * up through the shell, cut bait through the skin. Matched against bait
 * names and the catalogue's free-text bait lines ("Cut menhaden or mullet
 * strips; fresh shrimp; live finger mullet").
 */

export type BaitHow = { id: string; title: string; steps: string[] }

const RULES: { match: RegExp; how: BaitHow }[] = [
  {
    match: /fishbites/i,
    how: {
      id: 'fishbites',
      title: 'Fishbites',
      steps: ['Cut a strip about 1 in wide, peel it off the mesh, and hook through it once or twice. It stays on for hours.'],
    },
  },
  {
    match: /sabiki/i,
    how: {
      id: 'sabiki',
      title: 'Sabiki rig',
      steps: [
        'Jig the string of tiny flies slowly up and down where the bait schools are, with a light sinker at the bottom.',
        'If they won’t hit the bare flies, tip each hook with a speck of shrimp or fish.',
        'Unhook carefully: the loose hooks tangle and stick fingers. Wind it onto a pool noodle between drops.',
      ],
    },
  },
  {
    match: /bread|dough|rice|oatmeal/i,
    how: {
      id: 'dough',
      title: 'Bread and dough',
      steps: ['Pinch a pea-sized ball firmly around a tiny hook so it covers the point and won’t wash off. Chum a little in the water first.'],
    },
  },
  {
    match: /ghost shrimp|mud shrimp/i,
    how: {
      id: 'ghost-shrimp',
      title: 'Ghost or mud shrimp',
      steps: [
        'Thread a small hook in through the tail and up through the body.',
        'They are soft: a turn or two of bait thread keeps them on through the cast.',
      ],
    },
  },
  {
    match: /squid|\bika\b|tako|octopus/i,
    how: {
      id: 'squid',
      title: 'Squid',
      steps: [
        'Cut long, narrow strips tapered at one end so they flutter in the current.',
        'Hook through the wide end once or twice. It is tough, so it stays on well; tip a shrimp or worm bait with a small piece to keep it on.',
      ],
    },
  },
  {
    match: /\bcut\b|strip|chunk|belly|steak|fillet/i,
    how: {
      id: 'cut',
      title: 'Cut bait',
      steps: [
        'Cut fresh chunks or strips with the skin on, about the size of the hook gap or a little bigger.',
        'Hook through the skin side, once or twice, so it holds on the cast. With a circle hook, leave the point and barb clear.',
        'Change it every 15–20 minutes, once the blood and oil have washed out.',
      ],
    },
  },
  {
    match: /shrimp|ʻ?opae/i,
    how: {
      id: 'shrimp',
      title: 'Shrimp',
      steps: [
        'Live, under a float or free-lined: hook under the horn on top of the head, in front of the dark spot (its brain), so it stays alive and kicks.',
        'Live, for casting or the bottom: thread the hook in at the tail and out the underside, so it doesn’t fly off.',
        'Dead or pieces: peel, then thread on with the point just buried, in and out of the meat twice.',
      ],
    },
  },
  {
    match: /sand flea|mole crab|sand crab/i,
    how: {
      id: 'sand-flea',
      title: 'Sand fleas and sand crabs',
      steps: [
        'Hook from the underside, in near the tail flap and out through the top of the shell.',
        'Soft-shelled ones (freshly molted, often orange-egged females) are the best bait you can find.',
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
        'Or snap off the big claw and hook through the hole it leaves. Keep the crab whole otherwise.',
      ],
    },
  },
  {
    match: /blue crab|crab pieces|live crabs?|\bcrabs?\b/i,
    how: {
      id: 'crab',
      title: 'Crab',
      steps: [
        'Cut a blue crab in halves or quarters, remove the claws, and hook through a leg socket.',
        'Whole small crab (for permit, tarpon or cobia): hook through the corner of the shell, front to back, so it stays alive.',
      ],
    },
  },
  {
    match: /worm/i,
    how: {
      id: 'worm',
      title: 'Bloodworms and sandworms',
      steps: [
        'Hold it behind the head (bloodworms can bite) and thread a 1–2 in piece onto the hook from the head end.',
        'Leave a short tail free to wiggle. Bait thread helps them last.',
      ],
    },
  },
  {
    match: /clam|mussel/i,
    how: {
      id: 'clam',
      title: 'Clams and mussels',
      steps: [
        'Use the tough foot and the meat around it, and thread the hook through it a few times.',
        'Wrap it with bait thread or bait elastic: soft shellfish otherwise flies off the cast.',
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
    match: /mullet|menhaden|pogies|bunker|cigar|threadfin|runner|anchov|sardine|silverside|minnow|oama|halalu|opelu|mackerel|pinfish|grunion|baitfish|pilchard|scad|eel/i,
    how: {
      id: 'baitfish',
      title: 'Live baitfish',
      steps: [
        'Through both lips, from below and out the top: for a bait you cast, drift or slow-retrieve.',
        'Through the back just in front of the dorsal fin, above the spine: it swims away from you under a float.',
        'Through the nostrils (menhaden, mackerel, runners): for slow-trolling or live-lining off a pier.',
        'Miss the spine and the brain, and keep it in a bucket with an aerator until it goes on.',
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
  for (const part of baitLine.split(/[;,]|\bor\b|\band\b/i)) {
    // Lures and plugs aren't bait you hook.
    if (/jig|plug|spoon|lure|feather|dart|soft plastic/i.test(part)) continue
    const how = hookFor(part)
    if (how && !seen.has(how.id)) {
      seen.add(how.id)
      out.push(how)
    }
  }
  return out
}
