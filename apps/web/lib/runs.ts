/**
 * The seasonal runs and migrations anglers plan around, by region: the
 * fall mullet run, the spring cobia run, striper blitzes, the oama run in
 * Hawaii. Months are when each typically happens (it shifts a few weeks
 * with the water temperature year to year), so the forecast can say what's
 * on now and what's coming. `fish` are catalogue ids, for links.
 *
 * Region keys are apps/api's `conditions_region` (lib/fish.ts REGIONS).
 */

export type Run = {
  id: string
  title: string
  regions: string[]
  months: number[]
  fish: string[]
  what: string
  how: string
}

export const RUNS: Run[] = [
  {
    id: 'mullet-run',
    title: 'Fall mullet run',
    regions: ['atlantic_mid', 'atlantic_south'],
    months: [9, 10, 11],
    fish: ['bluefish', 'red-drum', 'jack-crevalle', 'tarpon', 'snook', 'flounder', 'spanish-mackerel'],
    what: 'Schools of finger mullet push south along the beaches as the water cools, and everything with teeth follows them.',
    how: 'Look for nervous water and diving birds just past the breakers. Throw a mullet-imitating plug or swimbait, or fish a live finger mullet on a fish-finder rig in the trough.',
  },
  {
    id: 'fall-drum',
    title: 'Fall red drum run',
    regions: ['atlantic_mid', 'atlantic_south'],
    months: [9, 10, 11],
    fish: ['red-drum'],
    what: 'Big spawning "bull" reds gather around inlets and in the surf. It’s the best chance all year at a trophy red from the beach.',
    how: 'Fish fresh cut mullet or menhaden on a fish-finder rig with a circle hook near inlet mouths and sloughs, especially on the falling tide. Release the big breeders quickly; they’re over the slot anyway.',
  },
  {
    id: 'flounder-run',
    title: 'Fall flounder run',
    regions: ['atlantic_mid', 'atlantic_south', 'gulf'],
    months: [10, 11, 12],
    fish: ['flounder', 'southern-flounder', 'gulf-flounder'],
    what: 'Flounder leave the marshes and head out through the inlets and passes to spawn offshore, stacking up at the mouths on the way.',
    how: 'Drag a live mud minnow or a jig with a soft-plastic tail slowly along the bottom near inlet structure, jetties and bridge pilings.',
  },
  {
    id: 'false-albacore',
    title: 'False albacore blitz',
    regions: ['atlantic_mid', 'atlantic_north'],
    months: [9, 10, 11],
    fish: ['false-albacore', 'atlantic-bonito'],
    what: 'Fast-moving schools of false albacore ("albies") and bonito tear through bait close to the beaches and inlets.',
    how: 'Watch for small, quick surface blitzes. Get a small metal jig or epoxy jig in front of them fast and retrieve as quickly as you can.',
  },
  {
    id: 'fall-kings',
    title: 'Fall king mackerel run',
    regions: ['atlantic_mid', 'atlantic_south'],
    months: [10, 11],
    fish: ['king-mackerel'],
    what: 'King mackerel move along the coast ahead of the cooling water and come within reach of the longer fishing piers.',
    how: 'From the end of the pier, cast a heavy anchor rig to hold bottom, then send a live bluefish, menhaden or mullet down the anchor line on a trolley rig with a wire stinger hook.',
  },
  {
    id: 'spring-cobia',
    title: 'Spring cobia run',
    regions: ['atlantic_mid', 'atlantic_south', 'gulf'],
    months: [3, 4, 5, 6],
    fish: ['cobia'],
    what: 'Cobia move north along the coast once the water passes about 68°F. They show in Florida and the Gulf in early spring and reach Virginia and the Chesapeake by late spring.',
    how: 'Sight-fish from a high vantage point for fish cruising near the surface, often under rays or around buoys, and pitch a bucktail jig or a live eel or menhaden.',
  },
  {
    id: 'spanish-arrive',
    title: 'Spanish mackerel arrive',
    regions: ['atlantic_mid', 'atlantic_south', 'gulf'],
    months: [4, 5, 6],
    fish: ['spanish-mackerel', 'bluefish'],
    what: 'Spanish mackerel show up along the beaches and piers once the water passes about 68°F, and stay through summer.',
    how: 'Cast small shiny spoons or Got-Cha plugs from the pier and retrieve fast. A float rig with a live shiner works when they are picky.',
  },
  {
    id: 'pompano-spring',
    title: 'Spring pompano run',
    regions: ['atlantic_south', 'gulf'],
    months: [3, 4],
    fish: ['pompano'],
    what: 'Pompano move north along the beaches as the surf warms, feeding on sand fleas in the wash.',
    how: 'Fish sand fleas or Fishbites on a double-dropper pompano rig in the first trough, close to the beach.',
  },
  {
    id: 'pompano-fall',
    title: 'Fall pompano run',
    regions: ['atlantic_south', 'gulf'],
    months: [10, 11, 12],
    fish: ['pompano'],
    what: 'Pompano head back south along the beaches as the water cools.',
    how: 'Same as spring: sand fleas or shrimp on a pompano rig in the first trough, on the moving tide.',
  },
  {
    id: 'tarpon-migration',
    title: 'Tarpon migration',
    regions: ['atlantic_south', 'gulf'],
    months: [5, 6, 7],
    fish: ['tarpon'],
    what: 'Big tarpon roll along the beaches and stack up in passes and inlets. The window is short.',
    how: 'Fish live crabs or mullet in passes on the outgoing tide, or freeline baits to rolling fish off the beach. Use heavy tackle and keep the fight short.',
  },
  {
    id: 'spring-stripers',
    title: 'Spring striper run',
    regions: ['atlantic_north', 'atlantic_mid'],
    months: [4, 5, 6],
    fish: ['striped-bass', 'bluefish'],
    what: 'Striped bass come up the coast from their spawning rivers, chasing herring and bunker into the bays and along the beaches.',
    how: 'Fish chunked or live bunker, or cast swimming plugs at dawn and dusk. Atlantic coast rules require inline circle hooks whenever you fish bait for stripers.',
  },
  {
    id: 'fall-stripers',
    title: 'Fall striper blitz',
    regions: ['atlantic_north', 'atlantic_mid'],
    months: [9, 10, 11, 12],
    fish: ['striped-bass', 'bluefish', 'false-albacore'],
    what: 'Stripers and bluefish feed hard on bunker, mullet and sand eels on their way south. It’s the busiest surf fishing of the year.',
    how: 'Follow the birds. Throw metal, bucktails or plugs into the blitz; after dark, swim a needlefish plug or soft plastic slowly.',
  },
  {
    id: 'tautog-fall',
    title: 'Fall tautog bite',
    regions: ['atlantic_north', 'atlantic_mid'],
    months: [10, 11, 12],
    fish: ['tautog', 'black-sea-bass'],
    what: 'Tautog feed heavily on rocks, wrecks and jetties as the water cools to around 55°F.',
    how: 'Fish green or Asian crabs on a tog jig or a short snell right on the rocks. Expect to lose rigs.',
  },
  {
    id: 'squid-spring',
    title: 'Spring squid run',
    regions: ['atlantic_north'],
    months: [4, 5, 6],
    fish: [],
    what: 'Longfin squid move inshore to spawn and crowd lit docks and piers at night.',
    how: 'Fish small squid jigs under dock lights after dark. Any you don’t eat make great bait.',
  },
  {
    id: 'bull-reds-gulf',
    title: 'Bull reds in the passes',
    regions: ['gulf'],
    months: [8, 9, 10],
    fish: ['red-drum'],
    what: 'Schools of big red drum gather at Gulf passes and along the beaches to spawn.',
    how: 'Heavy fish-finder rig with cut mullet or a live pinfish, fished on the outgoing tide at the passes and jetties.',
  },
  {
    id: 'trout-winter',
    title: 'Winter trout in deep holes',
    regions: ['gulf', 'atlantic_south'],
    months: [12, 1, 2],
    fish: ['speckled-trout', 'red-drum', 'black-drum'],
    what: 'Cold fronts push speckled trout and redfish into deep creeks, canals and holes where the water stays warmer.',
    how: 'Work soft plastics or suspending twitchbaits slowly along the bottom of the deep bends. Sunny afternoons after a front are best.',
  },
  {
    id: 'sheepshead-spring',
    title: 'Sheepshead spawn',
    regions: ['atlantic_south', 'gulf'],
    months: [2, 3, 4],
    fish: ['sheepshead'],
    what: 'Sheepshead gather on nearshore reefs, jetties and pilings to spawn, and you’ll see the year’s best numbers and sizes.',
    how: 'Drop a fiddler crab or sand flea on a short knocker rig straight down the pilings. Set the hook when you feel weight, not at the first tap.',
  },
  {
    id: 'grunion',
    title: 'Grunion runs',
    regions: ['pacific_south'],
    months: [3, 4, 5, 6, 7, 8],
    fish: [],
    what: 'Grunion swim up onto Southern California beaches to spawn on the highest tides of the month, for a few nights after each new and full moon.',
    how: 'Bare hands only, and anyone 16 or older needs a fishing license. Some months are look-but-don’t-touch to protect the spawn, so check California’s run schedule first.',
  },
  {
    id: 'white-seabass',
    title: 'White seabass season',
    regions: ['pacific_south'],
    months: [3, 4, 5, 6],
    fish: ['white-seabass'],
    what: 'White seabass move into the kelp beds and squid spawning grounds in spring.',
    how: 'Fish live squid near kelp edges at dawn and dusk, or slow-troll a big swimbait.',
  },
  {
    id: 'yellowtail-summer',
    title: 'Yellowtail season',
    regions: ['pacific_south'],
    months: [5, 6, 7, 8, 9, 10],
    fish: ['yellowtail', 'pacific-bonito', 'kelp-bass-calico-bass'],
    what: 'Yellowtail push up from Baja and around the islands with warming water, along with bonito.',
    how: 'Fish live sardine or mackerel, or yo-yo heavy iron jigs where the fish show on the meter.',
  },
  {
    id: 'surfperch-winter',
    title: 'Barred surfperch peak',
    regions: ['pacific_south', 'pacific'],
    months: [12, 1, 2, 3, 4],
    fish: ['barred-surfperch', 'redtail-surfperch'],
    what: 'Surfperch feed in the troughs all winter and spring, with big pregnant females close to the beach.',
    how: 'Fish sand crabs or a small Gulp grub on a Carolina rig in the trough and the edges of rip currents.',
  },
  {
    id: 'salmon-run',
    title: 'Salmon run',
    regions: ['pacific'],
    months: [7, 8, 9, 10],
    fish: ['chinook-salmon', 'coho-salmon'],
    what: 'Chinook and coho gather off river mouths and move into the bays and rivers to spawn.',
    how: 'Troll herring or spinners near river mouths and bay entrances. Seasons and closures change on short notice, so check before you go.',
  },
  {
    id: 'oama-run',
    title: 'Oama run',
    regions: ['hawaii_conditions'],
    months: [7, 8, 9, 10],
    fish: ['weke-goatfish'],
    what: 'Schools of oama (juvenile goatfish) fill sandy shallows and harbors, and everything bigger feeds on them.',
    how: 'Catch oama on tiny hooks with bread or shrimp, then fish them live under a float for papio, omilu and kaku.',
  },
  {
    id: 'halalu',
    title: 'Halalu season',
    regions: ['hawaii_conditions'],
    months: [6, 7, 8, 9],
    fish: ['akule'],
    what: 'Halalu (young akule) school in harbors and bays through summer.',
    how: 'Fish sabiki rigs, or tiny hooks with a little bread for chum, at dawn and dusk. Check local rules before you go.',
  },
]

export type RunStatus = { run: Run; status: 'now' | 'soon'; startsIn?: number }

/** What's running now in a region, then what starts within `ahead` months. */
export function runsFor(region: string, month: number, ahead = 2): RunStatus[] {
  const here = RUNS.filter((run) => run.regions.includes(region))
  const now = here.filter((run) => run.months.includes(month)).map((run): RunStatus => ({ run, status: 'now' }))
  const soon: RunStatus[] = []
  for (let step = 1; step <= ahead; step += 1) {
    const next = ((month - 1 + step) % 12) + 1
    for (const run of here) {
      if (run.months.includes(next) && !run.months.includes(month) && !soon.some((entry) => entry.run.id === run.id)) {
        soon.push({ run, status: 'soon', startsIn: step })
      }
    }
  }
  return [...now, ...soon]
}
