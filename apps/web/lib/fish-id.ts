/**
 * Telling fish apart, handling them safely, and what they're like to eat.
 *
 * apps/api's catalogue says where, when and how to catch a fish; this is
 * what you need once it's on the line: is it the fish you think it is
 * (lookalikes often have different limits, or none can be kept), what on
 * it can hurt you, and whether it's worth keeping for the table.
 *
 * `lookalikes` name other catalogue ids, each with how to tell the two
 * apart. Pairs are written from both sides so either fish page shows it.
 * Hazards that whole groups share (stingray barbs, catfish spines, moray
 * bites) come from `GROUP_HAZARDS`, matched on the species id.
 */

export type Lookalike = { id: string; tell: string }

export type FishNotes = {
  lookalikes?: Lookalike[]
  /** Things on this fish that can hurt you, and how to handle it. */
  handle?: string[]
  /** What it's like to eat (or why not to). */
  table?: string
}

const HOT_WATER = 'If you are stuck, soak the wound in water as hot as you can stand (not scalding) for 30–90 minutes and get it looked at.'

/** Hazards shared by a whole group of fish, keyed by a pattern on the id. */
const GROUP_HAZARDS: { match: RegExp; short: string; handle: string; table?: string }[] = [
  {
    match: /stingray|^bat-ray$|cownose-ray|eagle-ray|thornback-ray/,
    short: 'Venomous tail barb',
    handle: `A barbed, venomous spine on the tail. Shuffle your feet when wading, and keep the tail pinned away from you while you unhook it. ${HOT_WATER}`,
  },
  {
    match: /torpedo-ray|electric-ray/,
    short: 'Electric shock',
    handle: 'Gives a strong electric shock: cut the line rather than handle it.',
  },
  {
    match: /lionfish|scorpionfish/,
    short: 'Venomous spines',
    handle: `Venomous dorsal, pelvic and anal spines. Handle with puncture-proof gloves or pliers. ${HOT_WATER}`,
  },
  {
    match: /hardhead-catfish|gafftopsail-catfish/,
    short: 'Venomous spines',
    handle: `Serrated, venomous spines on the dorsal and both pectoral fins lock upright. Pin the fish under a towel and unhook it with pliers. ${HOT_WATER}`,
  },
  {
    match: /channel-catfish|blue-catfish|flathead-catfish/,
    short: 'Sharp spines',
    handle: 'Sharp spines on the dorsal and pectoral fins lock upright: grip behind them.',
  },
  {
    match: /stargazer/,
    short: 'Shock and spines',
    handle: `Can give an electric shock from behind the eyes, and has venomous spines above the pectoral fins. Unhook it with pliers. ${HOT_WATER}`,
  },
  {
    match: /moray|wolf-eel|conger-eel/,
    short: 'Hard bite',
    handle: 'Bites hard and holds on. Keep it out of your lap, and cut the leader rather than reach for the hook.',
  },
  {
    match: /puffer/,
    short: 'Toxic to eat',
    handle: 'Sharp beak-like teeth clip fingers as easily as line.',
    table: 'Do not eat: puffers can carry tetrodotoxin, a deadly poison that cooking does not destroy.',
  },
  {
    match: /surgeonfish|-tang$|doctorfish|ocean-surgeon/,
    short: 'Blade at the tail',
    handle: 'A scalpel-sharp spine on each side of the tail base: hold it by the head and keep the tail away from your hand.',
  },
  {
    match: /toadfish/,
    short: 'Hard bite',
    handle: 'Crushing jaws that clamp onto fingers, and spines on the gill covers. Use pliers.',
  },
  {
    match: /-shark$|dogfish|smoothhound/,
    short: 'Teeth',
    handle: 'Keep hands well clear of the mouth, use a dehooker or cut the leader close, and keep it in the water if you are letting it go. The skin is rough enough to cut.',
  },
  {
    match: /barracuda|bluefish|king-mackerel|spanish-mackerel|cero-mackerel|wahoo|ribbonfish|cutlassfish|needlefish|lizardfish|lingcod/,
    short: 'Sharp teeth',
    handle: 'Razor teeth: unhook with long pliers, never a finger in the mouth or a lip grip.',
  },
]

/** Releasing fish caught deep: their swim bladder swells on the way up
 * (barotrauma) and they float off and die unless sent back down. Not a
 * hazard to you, so no chip; it joins "Handle with care". */
const DEEP_RELEASE: { match: RegExp; note: string }[] = [
  {
    match: /hapuupuu|opakapaka|onaga|ehu-|gindai|kalekale|lehi-/,
    note: 'Caught from deep water, a fish you release may float with a swollen belly or bulging eyes (barotrauma). Return it to depth with a descending device rather than tossing it.',
  },
  {
    match: /snapper|grouper|graysby|tilefish|amberjack|almaco|banded-rudderfish|wenchman|red-porgy|triggerfish/,
    note: 'Caught from deep water, a fish you release may float with a swollen belly or eyes (barotrauma). Send it back down on a descending device rather than tossing it. Federal rules require a descending device (or, in the Gulf, a venting tool) rigged and ready when reef fishing in Gulf and South Atlantic federal waters.',
  },
  {
    match: /rockfish|lingcod|cabezon|greenling/,
    note: 'Caught from deep water, a fish you release may float with a swollen belly or bulging eyes (barotrauma). Return it to depth with a descending device: California requires one on board when boat fishing for groundfish.',
  },
]

/** Toxins worth a warning on the forecast's picks, not just the fish page. */
const TABLE_WARNINGS: Record<string, string> = {
  'great-barracuda': 'Ciguatera risk if you eat a big one',
  'roi': 'Ciguatera risk: usually not eaten',
  'northern-puffer-blowfish': 'Toxic organs: clean carefully',
  'cabezon': 'Never eat the roe',
  'nassau-grouper': 'Protected: release',
  'sand-tiger-shark': 'Protected: release',
  'sandbar-shark': 'Prohibited in federal waters',
  'dusky-shark': 'Prohibited in federal waters',
}

const NOTES: Record<string, FishNotes> = {
  'red-drum': {
    lookalikes: [
      { id: 'black-drum', tell: 'Red drum are copper-bronze with one or more black spots near the tail and no chin whiskers. Black drum are gray to black, taller-backed, and have whisker-like barbels under the chin.' },
    ],
    table: 'Slot-size reds are mild and firm. Big bull reds are coarser and are the spawners: let them go.',
  },
  'black-drum': {
    lookalikes: [
      { id: 'red-drum', tell: 'Black drum have chin barbels and a tall, arched back; red drum have no barbels and a black spot near the tail.' },
      { id: 'sheepshead', tell: 'Young black drum have dark vertical bars like a sheepshead, but they have chin barbels and no front teeth. Sheepshead have human-looking front teeth and no barbels.' },
    ],
    table: 'Fish up to about 15 lb eat well. Big ones are coarse and often carry harmless "spaghetti worms" in the meat.',
  },
  sheepshead: {
    lookalikes: [
      { id: 'black-drum', tell: 'Sheepshead have human-looking front teeth and no chin barbels; young black drum have barbels.' },
      { id: 'atlantic-spadefish', tell: 'Spadefish are disc-shaped with long trailing fins and a tiny mouth; sheepshead are longer, with stout spines and big front teeth.' },
    ],
    handle: ['Sharp dorsal and gill-cover spines, and teeth that crush barnacles: keep fingers out of the mouth.'],
    table: 'Excellent: sweet, white fillets. The scales and rib cage make it a chore to clean.',
  },
  'atlantic-spadefish': {
    lookalikes: [
      { id: 'sheepshead', tell: 'Spadefish are round and flat with long trailing fins and a tiny mouth; sheepshead have big teeth and a longer body.' },
    ],
    table: 'Good, mild fillets, smaller than you would think from the size of the fish.',
  },
  'speckled-trout': {
    lookalikes: [
      { id: 'weakfish-gray-trout', tell: 'Speckled trout have bold round black spots on the back, the dorsal fins and the tail. Weakfish have small, faint spots in wavy diagonal lines and none on the tail.' },
      { id: 'sand-seatrout-white-trout', tell: 'Sand seatrout are pale tan to silver with no spots.' },
    ],
    handle: ['Two large canine teeth at the front of the upper jaw.'],
    table: 'Very good fresh. The flesh is soft and doesn’t freeze well, so eat it within a day or two.',
  },
  'weakfish-gray-trout': {
    lookalikes: [
      { id: 'speckled-trout', tell: 'Weakfish have faint, small spots in diagonal lines and a plain tail; speckled trout have bold round spots, including on the tail.' },
    ],
    handle: ['The mouth tears easily (hence the name): net it instead of swinging it up.'],
    table: 'Good fresh, soft flesh.',
  },
  'sand-seatrout-white-trout': {
    lookalikes: [
      { id: 'speckled-trout', tell: 'Sand seatrout are plain pale tan with no spots; speckled trout are spotted down to the tail.' },
      { id: 'silver-seatrout', tell: 'Silver seatrout are smaller and silvery-white with a shorter lower jaw; sand seatrout are tan-backed.' },
    ],
    table: 'Good, mild and flaky.',
  },
  'spanish-mackerel': {
    lookalikes: [
      { id: 'king-mackerel', tell: 'Spanish mackerel have yellow-gold spots and a black patch at the front of the first dorsal fin. Adult king mackerel have no spots, a plain gray first dorsal, and a lateral line that dips sharply under the second dorsal fin.' },
      { id: 'cero-mackerel', tell: 'Cero have a yellow-bronze stripe running down the middle of the side as well as spots; Spanish have spots only.' },
    ],
    table: 'Good fresh: oily and mild if bled and iced right away. Doesn’t keep long in the freezer.',
  },
  'king-mackerel': {
    lookalikes: [
      { id: 'spanish-mackerel', tell: 'Kings have a lateral line that drops sharply under the second dorsal fin and no spots as adults; Spanish have gold spots and a black patch on the first dorsal.' },
      { id: 'wahoo', tell: 'Wahoo have tiger-like vertical bars and a long first dorsal fin running half the body; kings have a short first dorsal and no bars.' },
    ],
    table: 'Good smoked or as steaks. Large kings are high in mercury: the FDA advises pregnant women and children not to eat king mackerel.',
  },
  'cero-mackerel': {
    lookalikes: [
      { id: 'spanish-mackerel', tell: 'Cero have a yellow-bronze stripe down the middle of the side; Spanish have only spots.' },
    ],
    table: 'Good fresh, like Spanish mackerel.',
  },
  wahoo: {
    lookalikes: [
      { id: 'king-mackerel', tell: 'Wahoo have vertical tiger-like bars and a long, low first dorsal fin; king mackerel have neither.' },
    ],
    table: 'Excellent: white, firm and mild.',
  },
  bluefish: {
    table: 'Oily and strong. Bleed and ice it right away and eat small ones fresh. Some states post consumption advisories for large bluefish.',
  },
  pompano: {
    lookalikes: [
      { id: 'permit', tell: 'Permit are deeper-bodied and taller, with a dark patch near the pectoral fin; pompano are slimmer with yellow on the throat and belly. Under about 12 in, count the soft dorsal rays: permit have 17–21, pompano 22–27.' },
      { id: 'african-pompano', tell: 'African pompano have a steep, blunt forehead and long trailing filaments on the fins when young.' },
    ],
    table: 'Among the best-eating fish in the surf.',
  },
  permit: {
    lookalikes: [
      { id: 'pompano', tell: 'Permit are taller and deeper-bodied with a dark patch by the pectoral fin; pompano are slimmer with a yellow throat. Small ones: permit have 17–21 soft dorsal rays, pompano 22–27.' },
    ],
    table: 'Mostly released: in many places they are a catch-and-release fish.',
  },
  'african-pompano': {
    lookalikes: [
      { id: 'pompano', tell: 'African pompano have a steep, blunt forehead and, when young, long thread-like fin filaments.' },
    ],
    table: 'Good, firm white meat.',
  },
  flounder: {
    lookalikes: [
      { id: 'southern-flounder', tell: 'Summer flounder have five large eyespots in an X pattern near the tail. Southern flounder have no distinct eyespots, just diffuse blotches.' },
      { id: 'gulf-flounder', tell: 'Gulf flounder have three eyespots in a triangle; summer flounder have five.' },
    ],
    handle: ['Sharp teeth on both jaws.'],
    table: 'Excellent, mild white fillets.',
  },
  'southern-flounder': {
    lookalikes: [
      { id: 'flounder', tell: 'Southern flounder have no distinct eyespots; summer flounder have five in an X.' },
      { id: 'gulf-flounder', tell: 'Gulf flounder have three eyespots in a triangle; southern flounder have none that stand out.' },
    ],
    handle: ['Sharp teeth on both jaws.'],
    table: 'Excellent, mild white fillets.',
  },
  'gulf-flounder': {
    lookalikes: [
      { id: 'southern-flounder', tell: 'Gulf flounder have three eyespots in a triangle; southern flounder have no distinct eyespots.' },
      { id: 'flounder', tell: 'Gulf flounder have three eyespots; summer flounder have five in an X.' },
    ],
    table: 'Excellent, mild white fillets.',
  },
  snook: {
    handle: ['The edge of the gill cover is razor sharp (it cuts line and fingers). Hold it by the lower lip and support the belly; big ones are best kept horizontal.'],
    table: 'Very good, where you may keep one: skin it, as the skin tastes soapy.',
  },
  tarpon: {
    lookalikes: [
      { id: 'ladyfish', tell: 'Tarpon have huge scales, an upturned mouth and a long thread trailing from the last dorsal ray; ladyfish are slender with tiny scales and no thread.' },
    ],
    handle: ['Keep big fish in the water: in Florida, tarpon over 40 inches must not be taken out of the water.'],
    table: 'Not eaten: bony, and a catch-and-release fish.',
  },
  ladyfish: {
    lookalikes: [
      { id: 'tarpon', tell: 'Ladyfish are slim with small scales; tarpon have big scales and a trailing dorsal thread.' },
    ],
    table: 'Bony and soft: used as cut bait rather than eaten.',
  },
  cobia: {
    lookalikes: [
      { id: 'remora-sharksucker', tell: 'Remoras have a ridged sucking disc on top of the head. Cobia have a flat head with no disc. In the water, young cobia and remoras look very alike.' },
    ],
    handle: ['A green cobia thrashes violently on deck: tire it out before you gaff or boat it.'],
    table: 'Excellent: firm, white and rich.',
  },
  'remora-sharksucker': {
    lookalikes: [
      { id: 'cobia', tell: 'Remoras have a sucking disc on top of the head; cobia do not.' },
    ],
  },
  'jack-crevalle': {
    lookalikes: [
      { id: 'blue-runner', tell: 'Jack crevalle have a blunt head, a black spot on the gill cover and a dark blotch at the base of the pectoral fin; blue runners are slimmer with no pectoral blotch.' },
    ],
    table: 'Dark, strong-tasting meat: most are released.',
  },
  'blue-runner': {
    lookalikes: [
      { id: 'jack-crevalle', tell: 'Blue runners are slimmer, with no dark blotch at the base of the pectoral fin.' },
    ],
    table: 'Strong, dark meat: best as live or cut bait.',
  },
  'greater-amberjack': {
    lookalikes: [
      { id: 'almaco-jack', tell: 'Almaco jacks are deeper-bodied with tall, sickle-shaped second dorsal and anal fins; greater amberjack are longer and slimmer with short, low fin lobes.' },
      { id: 'lesser-amberjack', tell: 'Lesser amberjack stay small and are deeper-bodied for their size; size limits differ, so check which one you have.' },
    ],
    table: 'Good, firm white meat. Large fish often carry tail worms near the tail: cut them out.',
  },
  'almaco-jack': {
    lookalikes: [
      { id: 'greater-amberjack', tell: 'Almaco are taller with sickle-shaped dorsal and anal fins; greater amberjack are long with low fins.' },
    ],
    table: 'Very good, often better than amberjack.',
  },
  'lesser-amberjack': {
    lookalikes: [
      { id: 'greater-amberjack', tell: 'Lesser amberjack stay small and are deeper-bodied for their size.' },
    ],
  },
  'great-barracuda': {
    table: 'Small ones eat fine, but big reef barracuda can carry ciguatera toxin, which cooking does not destroy. Many anglers skip any over about 3 ft.',
  },
  'gray-triggerfish': {
    handle: ['Strong jaws with sharp teeth, and a first dorsal spine that locks upright.'],
    table: 'Excellent, sweet white meat. Skin it: the hide is like sandpaper.',
  },
  'hardhead-catfish-sea-catfish': {
    lookalikes: [
      { id: 'gafftopsail-catfish', tell: 'Hardheads have four barbels under the chin and short fin spines. Gafftopsail have two chin barbels and long thread-like streamers off the dorsal and pectoral spines.' },
    ],
    table: 'Usually thrown back: strong-tasting.',
  },
  'gafftopsail-catfish': {
    lookalikes: [
      { id: 'hardhead-catfish-sea-catfish', tell: 'Gafftopsail have long streamers off the dorsal and pectoral spines and two chin barbels; hardheads have four chin barbels.' },
    ],
    table: 'Good, mild white meat: better than its reputation. Watch for slime on the line.',
  },
  'spot': {
    lookalikes: [
      { id: 'atlantic-croaker', tell: 'Spot have a dark spot just behind the gill cover and slanted bars, with no chin barbels. Croaker have rows of small dots and tiny barbels under the chin.' },
    ],
    table: 'Good pan fish, fried whole.',
  },
  'atlantic-croaker': {
    lookalikes: [
      { id: 'spot', tell: 'Croaker have tiny chin barbels and rows of small spots; spot have one dark spot behind the gill and no barbels.' },
    ],
    table: 'Good pan fish.',
  },
  'whiting-sea-mullet': {
    lookalikes: [
      { id: 'northern-kingfish', tell: 'Northern kingfish have bold dark diagonal bars (a V on the shoulder); southern kingfish are grayer with faint bars.' },
      { id: 'gulf-kingfish', tell: 'Gulf kingfish are plain silver with no bars.' },
    ],
    table: 'Excellent: mild, sweet and flaky.',
  },
  'northern-kingfish': {
    lookalikes: [
      { id: 'whiting-sea-mullet', tell: 'Northern kingfish have bold dark bars; southern kingfish are grayer with faint bars.' },
    ],
    table: 'Excellent: mild and flaky.',
  },
  'gulf-kingfish': {
    lookalikes: [
      { id: 'whiting-sea-mullet', tell: 'Gulf kingfish are plain silver with no bars; southern kingfish are grayer with faint bars.' },
    ],
    table: 'Excellent: mild and flaky.',
  },
  'mangrove-snapper': {
    lookalikes: [
      { id: 'lane-snapper', tell: 'Lane snapper have pink and yellow horizontal stripes and a dark spot below the soft dorsal fin; mangroves are gray to coppery with no spot and no stripes.' },
      { id: 'mutton-snapper', tell: 'Mutton snapper have a small black spot on the side, blue lines under the eye and a pointed anal fin; mangroves have a rounded anal fin and no spot.' },
      { id: 'red-snapper', tell: 'Small red snapper are pink-red all over with a red eye; mangroves are gray-copper.' },
    ],
    handle: ['Two large canine teeth at the front of the upper jaw.'],
    table: 'Excellent, mild white fillets.',
  },
  'lane-snapper': {
    lookalikes: [
      { id: 'mangrove-snapper', tell: 'Lane snapper have pink-yellow stripes and a dark spot under the soft dorsal; mangroves have neither.' },
      { id: 'mutton-snapper', tell: 'Mutton snapper grow much larger, are olive on the back, and have blue lines under the eye; both have a dark side spot.' },
    ],
    table: 'Very good, though small.',
  },
  'mutton-snapper': {
    lookalikes: [
      { id: 'lane-snapper', tell: 'Mutton snapper have blue lines under the eye and a pointed anal fin; lane snapper have yellow-pink stripes.' },
      { id: 'mangrove-snapper', tell: 'Mutton snapper have a black side spot and a pointed anal fin; mangroves have no spot.' },
    ],
    table: 'Excellent.',
  },
  'red-snapper': {
    lookalikes: [
      { id: 'vermilion-snapper-beeliner', tell: 'Red snapper are deeper-bodied with a red eye and a pointed anal fin; vermilion snapper are slimmer, more orange-red, with thin yellow lines along the side.' },
      { id: 'mangrove-snapper', tell: 'Red snapper are pink-red all over; mangroves are gray to copper.' },
    ],
    table: 'Excellent. Federal and state seasons are short and change yearly: check before you keep one.',
  },
  'vermilion-snapper-beeliner': {
    lookalikes: [
      { id: 'red-snapper', tell: 'Vermilion are slimmer and more orange, with thin yellow lines along the side; red snapper are deeper-bodied with a red eye.' },
    ],
    table: 'Very good, mild fillets.',
  },
  'yellowtail-snapper': {
    lookalikes: [
      { id: 'mutton-snapper', tell: 'Yellowtail have a bright yellow stripe from the snout to a deeply forked yellow tail.' },
    ],
    table: 'Excellent, delicate fillets.',
  },
  'gag-grouper': {
    lookalikes: [
      { id: 'black-grouper', tell: 'Gag have gray worm-like squiggles ("kiss marks") on the sides; black grouper have rectangular dark blotches and brassy spots.' },
      { id: 'scamp-grouper', tell: 'Scamp have a ragged, spiky-edged tail and brown spots in clusters.' },
      { id: 'red-grouper', tell: 'Red grouper are reddish-brown with a red-orange lining inside the mouth and a straight-edged spiny dorsal fin.' },
    ],
    table: 'Excellent, firm white fillets.',
  },
  'black-grouper': {
    lookalikes: [
      { id: 'gag-grouper', tell: 'Black grouper have rectangular dark blotches and brassy spots; gag have gray worm-like markings.' },
    ],
    table: 'Excellent.',
  },
  'red-grouper': {
    lookalikes: [
      { id: 'gag-grouper', tell: 'Red grouper are reddish-brown with a red-orange mouth lining and a straight-edged spiny dorsal; gag are gray with squiggles.' },
    ],
    table: 'Excellent.',
  },
  'scamp-grouper': {
    lookalikes: [
      { id: 'gag-grouper', tell: 'Scamp have a ragged tail with spiky tips and clustered brown spots.' },
    ],
    table: 'Among the best-eating groupers.',
  },
  'nassau-grouper': {
    handle: ['Protected: Nassau grouper may not be kept in U.S. waters. Release it quickly at depth.'],
  },
  'blackfin-tuna': {
    lookalikes: [
      { id: 'yellowfin-tuna', tell: 'Blackfin have dark finlets with only a hint of yellow; yellowfin have bright yellow finlets and, on bigger fish, long yellow second dorsal and anal fins.' },
      { id: 'skipjack-tuna', tell: 'Skipjack have 3–5 dark horizontal stripes on the belly.' },
      { id: 'false-albacore', tell: 'False albacore have wavy, worm-like lines on the back and a few dark spots under the pectoral fin.' },
    ],
    table: 'Excellent raw or seared, if bled and iced right away.',
  },
  'yellowfin-tuna': {
    lookalikes: [
      { id: 'blackfin-tuna', tell: 'Yellowfin have bright yellow finlets and long yellow dorsal and anal fins on big fish; blackfin finlets are dark.' },
    ],
    table: 'Excellent raw or seared.',
  },
  'skipjack-tuna': {
    lookalikes: [
      { id: 'false-albacore', tell: 'Skipjack have dark stripes on the belly; false albacore have wavy lines on the back and spots under the pectoral fin.' },
    ],
    table: 'Strong, dark meat: good bled and eaten fresh, or as bait.',
  },
  'false-albacore': {
    lookalikes: [
      { id: 'atlantic-bonito', tell: 'False albacore have wavy, worm-like lines on the back and a few dark spots under the pectoral fin. Atlantic bonito have straight, slanted dark stripes along the back and visible teeth.' },
      { id: 'skipjack-tuna', tell: 'Skipjack have stripes on the belly instead of wavy lines on the back.' },
    ],
    table: 'Dark and strong: most are released.',
  },
  'atlantic-bonito': {
    lookalikes: [
      { id: 'false-albacore', tell: 'Atlantic bonito have straight, slanted stripes on the back and noticeable teeth; false albacore have wavy lines and no teeth to speak of.' },
    ],
    table: 'Good bled and eaten fresh.',
  },
  sailfish: {
    lookalikes: [
      { id: 'white-marlin', tell: 'Sailfish have a tall, sail-like dorsal fin; white marlin have a lower dorsal with a rounded tip.' },
    ],
    table: 'A release fish.',
  },
  'white-marlin': {
    lookalikes: [
      { id: 'blue-marlin', tell: 'White marlin have rounded tips on the first dorsal and anal fins, often with spots; blue marlin have pointed tips and grow far larger.' },
      { id: 'sailfish', tell: 'Sailfish have a tall sail of a dorsal fin.' },
    ],
    table: 'A release fish.',
  },
  'blue-marlin': {
    lookalikes: [
      { id: 'white-marlin', tell: 'Blue marlin have a pointed first dorsal fin; white marlin have rounded fin tips.' },
    ],
    table: 'A release fish.',
  },
  'blacktip-shark': {
    lookalikes: [
      { id: 'spinner-shark', tell: 'Spinner sharks have a black tip on the anal fin and a longer, more pointed snout. Blacktips have no black on the anal fin.' },
    ],
  },
  'spinner-shark': {
    lookalikes: [
      { id: 'blacktip-shark', tell: 'Spinners have a black-tipped anal fin; blacktips do not.' },
    ],
  },
  'sandbar-shark': {
    lookalikes: [
      { id: 'dusky-shark', tell: 'Sandbar sharks have a very tall first dorsal fin set over the pectoral fins; dusky sharks have a lower dorsal set farther back.' },
      { id: 'bull-shark', tell: 'Bull sharks have a short, blunt snout, small eyes and no ridge between the dorsal fins; sandbars have a ridge.' },
    ],
    handle: ['Sandbar and dusky sharks may not be kept in federal waters: release them in the water.'],
  },
  'dusky-shark': {
    lookalikes: [
      { id: 'sandbar-shark', tell: 'Dusky sharks have a lower first dorsal fin set behind the pectoral fins; sandbars have a tall dorsal right over the pectorals.' },
    ],
    handle: ['Dusky sharks may not be kept in federal waters: release them in the water.'],
  },
  'bull-shark': {
    lookalikes: [
      { id: 'sandbar-shark', tell: 'Bull sharks have a short, blunt snout and no ridge between the dorsal fins.' },
    ],
  },
  'bonnethead-shark': {
    lookalikes: [
      { id: 'scalloped-hammerhead-shark', tell: 'Bonnetheads have a smooth, rounded shovel-shaped head; scalloped hammerheads have a wide hammer with a notch in the middle of the front edge.' },
    ],
  },
  'scalloped-hammerhead-shark': {
    lookalikes: [
      { id: 'bonnethead-shark', tell: 'Scalloped hammerheads have a wide, notched hammer; bonnetheads have a rounded shovel head.' },
    ],
    handle: ['Hammerheads tire and die easily: keep the fight short and release in the water. Florida prohibits keeping them from state waters.'],
  },
  'sand-tiger-shark': {
    handle: ['Protected: sand tigers may not be kept. Release in the water, with the ragged teeth well clear of your hands.'],
  },
  'spiny-dogfish': {
    lookalikes: [
      { id: 'smooth-dogfish', tell: 'Spiny dogfish have a sharp spine in front of each dorsal fin and white spots on the back; smooth dogfish have no spines.' },
    ],
    handle: ['A mildly venomous spine in front of each dorsal fin: hold it behind the head.'],
  },
  'smooth-dogfish': {
    lookalikes: [
      { id: 'spiny-dogfish', tell: 'Smooth dogfish have no dorsal spines and a plain gray back.' },
    ],
    table: 'Good if bled and iced right away.',
  },
  'chinook-salmon': {
    lookalikes: [
      { id: 'coho-salmon', tell: 'Chinook have black gums and small black spots on both lobes of the tail. Coho have white or gray gums and spots on the upper tail lobe only.' },
    ],
    table: 'Excellent.',
  },
  'coho-salmon': {
    lookalikes: [
      { id: 'chinook-salmon', tell: 'Coho have white gums at the base of the teeth and spots only on the upper tail lobe; chinook have black gums.' },
    ],
    table: 'Excellent.',
  },
  'tautog': {
    lookalikes: [
      { id: 'cunner-bergall', tell: 'Tautog have a blunt, rounded head, thick lips and a white chin. Cunner rarely top a pound and have a more pointed snout.' },
    ],
    table: 'Excellent: firm, white and sweet.',
  },
  'cunner-bergall': {
    lookalikes: [
      { id: 'tautog', tell: 'Cunner stay small with a pointed snout; tautog have a blunt head and thick lips.' },
    ],
  },
  'black-sea-bass': {
    handle: ['Sharp dorsal spines and a spine on the gill cover.'],
    table: 'Excellent, mild white fillets.',
  },
  'striped-bass': {
    table: 'Very good. Some states post consumption advisories for large stripers from certain waters: check yours.',
  },
  'sea-robin': {
    handle: ['A bony, spiny head and sharp gill-cover spines.'],
    table: 'Underrated: firm and mild tail meat.',
  },
  'northern-puffer-blowfish': {
    table: 'Northern puffer meat is eaten ("sea squab"), but other puffers and some puffer organs carry deadly tetrodotoxin. Only eat it if you are sure of the species and only the cleaned tail meat.',
  },
  'red-lionfish-invasive': {
    table: 'Excellent, and invasive: keep every one you can. The meat is safe once the spines are removed.',
  },
  lingcod: {
    table: 'Excellent. Some have blue-green flesh: that is normal and turns white when cooked.',
  },
  cabezon: {
    handle: ['Cabezon roe is poisonous: never eat the eggs.'],
    table: 'Good meat, which may be blue-green raw and turns white when cooked.',
  },
  'kelp-bass-calico-bass': {
    lookalikes: [
      { id: 'barred-sand-bass', tell: 'Kelp bass have pale squarish blotches on the back; barred sand bass have dark vertical bars.' },
      { id: 'spotted-sand-bass', tell: 'Spotted sand bass are covered in small black spots.' },
    ],
  },
  'barred-sand-bass': {
    lookalikes: [
      { id: 'kelp-bass-calico-bass', tell: 'Barred sand bass have dark vertical bars; kelp bass have pale blotches on the back.' },
      { id: 'spotted-sand-bass', tell: 'Spotted sand bass are covered in small black spots instead of bars.' },
    ],
  },
  'spotted-sand-bass': {
    lookalikes: [
      { id: 'barred-sand-bass', tell: 'Spotted sand bass are covered in small black spots; barred sand bass have vertical bars.' },
    ],
  },
  'ulua-giant-trevally': {
    lookalikes: [
      { id: 'omilu-bluefin-trevally', tell: 'Omilu have electric-blue fins and blue spots; ulua are dull silver-gray to black with a steep forehead.' },
    ],
    table: 'Large ulua can carry ciguatera in some areas: ask locally before keeping a big one.',
  },
  'omilu-bluefin-trevally': {
    lookalikes: [
      { id: 'ulua-giant-trevally', tell: 'Omilu have bright blue fins and spots; ulua have none.' },
    ],
  },
  roi: {
    table: 'Often carries ciguatera: most Hawaii anglers do not eat roi. Removing it helps the reef.',
  },
  'atlantic-sharpnose-shark': {
    table: 'Good if bled and iced right away.',
  },
}

/** Everything we know about handling, telling apart and eating a fish. */
export function fishNotes(id: string): FishNotes & { hazards: string[] } {
  const own = NOTES[id] ?? {}
  const group = GROUP_HAZARDS.filter((hazard) => hazard.match.test(id))
  return {
    ...own,
    table: own.table ?? group.find((hazard) => hazard.table)?.table,
    handle: [
      ...group.map((hazard) => hazard.handle),
      ...(own.handle ?? []),
      ...DEEP_RELEASE.filter((entry) => entry.match.test(id)).slice(0, 1).map((entry) => entry.note),
    ],
    hazards: group.map((hazard) => hazard.short),
  }
}

/** One short warning for a forecast pick, or null: a protected fish, a
 * toxin, or the hazard you'd meet unhooking it. */
export function pickWarning(id: string): string | null {
  if (TABLE_WARNINGS[id]) return TABLE_WARNINGS[id]
  const group = GROUP_HAZARDS.find((hazard) => hazard.match.test(id))
  return group ? group.short : null
}
