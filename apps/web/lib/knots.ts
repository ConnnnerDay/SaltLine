import type { RigId } from './rigs'

/**
 * Fishing knots, and which ones each rig in Rigs & tips needs -- the
 * legacy app's KNOTS_DB / _RIG_KNOTS (domain/species.py), ported as-is:
 * what each knot is for, roughly how strong it is, and how to tie it step
 * by step.
 */

export type KnotId =
  | 'improved_clinch'
  | 'palomar'
  | 'uni_knot'
  | 'uni_to_uni'
  | 'fg_knot'
  | 'surgeons_loop'
  | 'dropper_loop'
  | 'haywire_twist'
  | 'snell_knot'
  | 'albright_knot'

export type Knot = {
  id: KnotId
  name: string
  /** What it's for. */
  use: string
  /** How strong the knot is compared with the line, in words. Published
   * tests vary too much (by line, tying and test) for a single percentage
   * to mean anything. */
  strength: string
  steps: string[]
}

export const KNOTS: Record<KnotId, Knot> = {
  improved_clinch: {
    id: 'improved_clinch',
    name: 'Improved Clinch Knot',
    use: 'Hook or swivel to mono or fluoro (it can slip in braid)',
    strength: 'Strong',
    steps: [
      'Thread 6" of line through the hook eye.',
      'Wrap the tag end around the standing line 5-7 times.',
      'Pass the tag end through the small loop at the hook eye.',
      'Pass it again through the big loop you just created.',
      'Moisten, pull tight, trim tag.',
    ],
  },
  palomar: {
    id: 'palomar',
    name: 'Palomar Knot',
    use: 'Hook to braid or mono \u2014 strongest simple knot',
    strength: 'Very strong',
    steps: [
      'Double 6" of line and pass the loop through the hook eye.',
      'Tie a simple overhand knot with the doubled line.',
      'Pass the loop over the entire hook.',
      'Moisten and pull both ends to tighten. Trim tag.',
    ],
  },
  uni_knot: {
    id: 'uni_knot',
    name: 'Uni Knot',
    use: 'All-purpose: hook, swivel, or line-to-line',
    strength: 'Strong',
    steps: [
      'Pass line through the eye, double back 6".',
      'Form a loop alongside the doubled line.',
      'Wrap the tag end through the loop 4-6 times.',
      'Moisten, pull tag end to tighten, then slide knot to eye.',
    ],
  },
  uni_to_uni: {
    id: 'uni_to_uni',
    name: 'Double Uni Knot',
    use: 'Braid to fluoro/mono leader connection',
    strength: 'Strong',
    steps: [
      'Overlap braid and leader by 8".',
      'Make a Uni Knot with each tag end (4 wraps for mono, 8 for braid).',
      'Moisten both knots.',
      'Pull standing lines to slide knots together. Trim tags.',
    ],
  },
  fg_knot: {
    id: 'fg_knot',
    name: 'FG Knot',
    use: 'Braid to leader \u2014 slimmest, strongest connection',
    strength: 'Very strong',
    steps: [
      'Tension braid between teeth and rod.',
      'Weave leader over and under braid 15-20 alternating wraps.',
      'Cinch tight with half hitches (3-4).',
      'Lock with 2 half hitches on braid only. Trim and melt tag.',
    ],
  },
  surgeons_loop: {
    id: 'surgeons_loop',
    name: "Surgeon's Loop",
    use: 'Create a loop for dropper rigs and quick-change clips',
    strength: 'Strong',
    steps: [
      'Double 3" of line to form a loop.',
      'Tie an overhand knot with the doubled section.',
      'Pass the loop through a second time (double overhand).',
      'Moisten and pull tight.',
    ],
  },
  dropper_loop: {
    id: 'dropper_loop',
    name: 'Dropper Loop',
    use: 'Create a standing loop mid-leader for hi-lo rigs',
    strength: 'Weaker than the line',
    steps: [
      'Make a loop in the leader where you want the dropper.',
      'Twist the loop around itself 6–8 times, so the two sides wrap around each other.',
      'Open a gap in the middle of the twists and push the top of the loop through it.',
      'Hold the new loop (a finger or your teeth), moisten, and pull both ends of the leader to tighten.',
    ],
  },
  haywire_twist: {
    id: 'haywire_twist',
    name: 'Haywire Twist',
    use: 'Single-strand wire to hook or swivel',
    strength: 'Full wire strength',
    steps: [
      'Pass the wire through the hook eye and cross the tag over the standing wire.',
      'Twist both wires around each other 4–5 times, like an X, not one around the other (the haywire twists).',
      'Bend the tag 90° and wrap it tightly around the standing wire 5–6 times (the barrel wraps).',
      'Bend the tag into a small handle and rock it until it breaks off clean at the last wrap. Don’t cut it: a cut end leaves a sharp burr.',
    ],
  },
  snell_knot: {
    id: 'snell_knot',
    name: 'Snell Knot',
    use: 'Attach a hook in-line with the leader for stronger hooksets on bait rigs',
    strength: 'Very strong',
    steps: [
      'Pass 6–8 in of leader through the hook eye and lay it along the shank toward the bend.',
      'Fold the tag back toward the eye, making a loop that lies along the shank.',
      'Wrap the tag through the loop and around the shank and both lines 6–8 times, working toward the eye.',
      'Moisten and pull the standing line to cinch the wraps. The line should leave straight out of the front of the eye. Trim the tag.',
    ],
  },
  albright_knot: {
    id: 'albright_knot',
    name: 'Albright Knot',
    use: 'Join mono or braid mainline to single-strand or cable wire leader',
    strength: 'Strong',
    steps: [
      'Form a loop in the wire, hold it firm.',
      'Pass 10-12 in of mono/braid through the loop.',
      "Wrap the tag end back over both wire strands and itself 10-12 times, working toward the loop's closed end.",
      'Pass the tag back through the loop where it entered. Moisten, pull tight, trim.',
    ],
  },
}

/** The knots each rig is tied with (legacy _RIG_KNOTS, mapped to these rigs). */
export const RIG_KNOTS: Record<RigId, KnotId[]> = {
  fish_finder: ['improved_clinch', 'uni_to_uni'],
  hi_lo: ['dropper_loop', 'snell_knot', 'improved_clinch'],
  pompano: ['dropper_loop', 'snell_knot', 'surgeons_loop'],
  knocker: ['palomar', 'uni_to_uni'],
  popping_cork: ['uni_knot', 'uni_to_uni'],
  float: ['improved_clinch', 'uni_knot'],
  jig: ['palomar', 'uni_to_uni'],
}
