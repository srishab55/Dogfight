# Development progress

Legend: ✅ done and verified · 🔄 in progress · ⬜ not started

**Current status:** The match is in (your requests): you against four Red
AI pilots on a smaller map, island airfields to take, carriers as home bases,
a timer, and the side holding more bases wins. Auto-land is faster and
terrain-aware. Remaining in Phase 4: bombs. Waiting for your test
(FLIGHT_TEST.md card 41) and confirmation.

## The match: bases, timer and Red AI pilots ✅ (your requests, 2026-11-18)

- ✅ Map about half the size, point-symmetric: carriers 5.6 km apart (was 10.3), neighbouring bases 2.5–4 km (was 7–10); the islands smaller; terrain 10 km square at 40 m cells. Every runway east-west, so all approaches are over open sea and no approach clearance cuts another island's mountain (found by surveying the terrain)
- ✅ Runways 60 m wide (were 40), each with a service lane beside it (yellow lines, white parking boxes) joined by two taxiways: paved ground with runway grip, inside the service and capture area
- ✅ Each team's home is its carrier; the three island airfields (the central island has one now) start belonging to nobody: land and stop 5 s to take one, its AA gun is built for you 30 s later; a held field is retaken by destroying its AA gun, hangar, fuel depot and radar and landing. Carriers are captured the same way (their AA gun, then the deck), and can't be sunk in a match
- ✅ Match rules (shared `match.ts`): 5 / 10 / 15 minutes (chosen in the hangar); at time-out the side holding more bases wins, equal is a draw; a side holding no base loses at once. The aircraft is locked for the match (cards disabled; base and paint can change); exiting to the main menu resets the world, the squadron and the scores
- ✅ Red AI: four pilots (two hunters, two raiders) built as a state machine plus behaviour tree after `game-skills/GameAI` (stateful sequence and reactive selector, blackboard). In priority order: take off or wait out a capture/service, pull up from terrain, stay on the map (except chasing), fly its landing, break when attacked, go home to rearm, attack aircraft (lead pursuit, then a gun solution with an integral aim correction), take a base (land if open, strafe its defences if not; teammates spread out), patrol. Same flight model, guns and rules as you; deterministic
- ✅ HUD: time left, bases held by each side, kills, objective (the nearest base you don't hold); Red aircraft marked with type and distance; every aircraft on the map. Messages for kills, who shot you down, and every capture. Report: Victory / Defeat / Draw / Abandoned, bases at the end, your figures. Lobby lists Red's AI pilots
- ✅ Heavy Bomber: too big for the deck, so it is launched into the air over its carrier until its side holds an airfield
- ✅ Auto-land faster and terrain-aware: shortest-way runway choice (turns counted), 1.3 km final (was 2 km), tighter teardrop, fast transit with an achievable air-braked slow-down, steep descents (12°, gentler for the Heavy Bomber), climb-out before turning after a go-around, no steep turns low down, and terrain checked along the arc it will fly and the next 6 s of its path in every phase (final had none). On 40 approaches from all round every base: mean 114 s → 81 s, 1 crash → 0
- ✅ Interceptor's nose-wheel steering fades with speed like the vintage types' (it tipped onto a wingtip in a full-rudder taxi turn on the wider runway)
- Verified: 497 tests (1 skipped by design; new: base rules incl. carrier capture and reset, behaviour tree, AI squadron takes all three fields in 5 minutes without losses, AI shoots down a target, breaks when attacked, rearms and relaunches, match rules, auto-land sweep), typecheck, build, and headless Chrome at 1366×768: a 5-minute match (start, Red airborne and on the map, aircraft locked, time-out report, reset), a dogfight (two hunters attacking a circling player, hull 180 → 67), every screen at 1366×768 and 1920×1080, HUD zones without overlaps; 60 FPS with four AI aircraft; no console errors

## Interface redesign ✅ (your brief, 2026-11-18)

- ✅ Design system: tokens for colour (dark slate surfaces; cyan selection, amber caution, red danger and enemy, blue friendly), type (Rajdhani, Inter, JetBrains Mono; self-hosted, OFL), spacing, shape, motion and layers; one stylesheet of components (buttons, menu items, tabs, segmented controls, switches, sliders, dropdowns, bars, stat rows, cards, tags, chips, key labels, tooltips, modals, notifications) built by `ui/components.ts`
- ✅ HUD in zones: status top left (bases held, home base, targets, objective), radar top centre (with a sweep), airframe bottom left (hull bar and damage state, gear, flaps), instruments bottom centre (airspeed, altitude, vertical speed, heading tape, throttle, AoA, g), weapons bottom right (ammunition, gun heat, bombs, rearming); alerts, approach guide, prompts and messages in the centre band; no overlaps at 1366×768 or 1920×1080
- ✅ Main menu over the parked aircraft: PLAY, Multiplayer, Settings, Controls; callsign (editable, remembered); connection status (offline)
- ✅ Hangar redesigned as aircraft selection: cards with class tags, bars comparing each type with the fleet plus exact figures, loadout, paint swatches, the deploy map and start; the camera eases between aircraft sizes. After a crash it becomes the respawn screen (cause, aircraft, time in the air, kills, rounds left), opening by itself after 1.5 s; Enter still flies again at once
- ✅ Pause menu (Esc): Resume, Change aircraft / base, Settings, Controls, Audio, Return to lobby (Phase 5, disabled), Exit to main menu
- ✅ Settings that all change the game: graphics preset, render resolution, antialiasing, shadows, bloom; sound and master volume; steering, mouse aim sensitivity, camera drag speed and rebinding of every flight key (with conflict notices and reset); target markers, base labels and beacons, auto-land offers; HUD scale (capped to fit the window), reduced motion, damage flash, camera shake. Remembered in this browser
- ✅ Lobby layout with the truth: offline, one player (you, Blue), room and ready controls disabled with the phase they arrive in
- ✅ After-action report on Exit: targets destroyed by type, damage dealt, hit accuracy, deaths (shot down / crashed), bases captured, sorties, flying time; winner, team score, assists and bombing shown as "—" with their phase
- ✅ Found and fixed while testing the Shadows setting: the aircraft's shadow had vanished (the map was stretched over every building on the map); now a sharp 160 m square around the aircraft
- Verified: 441 tests (1 skipped by design), typecheck, build, and headless Chrome at 1366×768 and 1920×1080: 36 checks per size (every screen inside the window without overlaps, keyboard focus and arrows, presets reaching the renderer, rebinding, Esc during capture, HUD scale cap with no zone overlap at the largest, reduced motion, pause stopping physics, respawn after 1.5 s counting the loss once, report, Continue); 60 FPS; no console errors

## Extras added along the way

- ✅ Mouse flight: click to capture the mouse; the aircraft flies towards the aim circle, using the shared
  direction pilot (lift-vector pointing, achievable-turn cap, AoA limiter, load feedback). 15 tests.
- ✅ Moving control surfaces on both wings and the tail: ailerons, elevators, rudder (follow the inputs with actuator lag)
- ✅ Realistic flaps: slotted (hinged below the wing, rounded nose, hinge brackets) and Fowler (also slide aft) for the bomber
- ✅ Guns moved from X to Space
- ✅ Mouse sensitivity raised (0.2°/pixel) and adjustable in game with **[** / **]**; remembered between sessions
- ✅ Deployment config for Vercel: production build verified in headless Chrome (no errors; dev-only debug handle absent)

## Milestone: islands, carriers and new aircraft ✅ (your request, 2026-11-16)

- ✅ "Dogfight Squadron" title along the top of the screen (and the page title); since the redesign, the main menu's logo
- ✅ Island map: three islands (Blue, Red, mountainous central) in the sea, ragged coastlines, beaches, woods on the hillsides, fields on the plains; runways on flattened pads with clear approaches. 9 tests
- ✅ Sea: one-pass custom shader. Turquoise shallows, deep blue offshore, surf, sky reflection, sun glint, waves that fade before they alias
- ✅ Two anchored carriers (Blue and Red): hull, deck markings, island with team band, arrestor wires, catapult, approach lights. Their decks are real ground; the island is solid; the sea is ditching
- ✅ Bow catapult (holdback, full throttle launches, 3 g over 45 m) and arrestor hook (arms in the air, catches a wire, holds until idle). 10 carrier tests, including "lands itself from carrier landing practice"
- ✅ Five aircraft types, each with its own shape built from shared airframe data: Naval Fighter (new), Dive Bomber (new, with dive brakes), Heavy Bomber (now four-engined, 24 m wing); Interceptor and Fighter-Bomber keep the fighter airframe. All pass the full flight test; both new types loop
- ✅ Limited ammunition per class; OUT OF AMMO warning; rearm and repair by stopping at idle on a friendly airfield or carrier (6 s). 8 tests
- ✅ HUD: AMMO count and bar, BASE distance and bearing (ON BASE), rearming progress, catapult and hook status
- Verified: typecheck, 258 tests (1 skipped by design), production build, and headless Chrome: spawn, island overview, coast, catapult launch, hands-off carrier landing (caught a wire, 2.0 m/s GOOD), out of ammo then rearmed on the deck, every new model, firing over the sea. 60 FPS at 1280x720, 52–71 draw calls, no console errors

## The hangar ✅ (your request, 2026-11-18)

- ✅ A hangar screen at the start of the game and on **Esc** (it pauses the game): the seven aircraft with their figures (top speed, stall speed, climb, turn, guns, armour, gear, carriers) and a line on what each is for; paint swatches; the base map (click a base, or ← →); the start (runway, in the air, landing practice); settings (steering, mouse sensitivity, sound); the flight controls. FLY (Enter) or RESUME (Esc)
- ✅ Your aircraft on show behind the panels, the orbit camera slowly circling it (drag to look round). Stopped or crashed, choosing an aircraft or base parks it there to look at; during a flight, looking at another type is a preview that leaves the flight alone
- ✅ Flight keys cut to the flying ones: W/S, A/D, Q/E, ↑/↓, B, F/V, Space, X, C, P, N and Esc. R, T, L, 1-7, O, J, K, M, [ ] and H moved into the hangar (1-7, ← → and Enter stay as hangar shortcuts). The in-flight help list became one line: "Esc · hangar & controls". After a crash, Enter flies again
- ✅ Esc while flying with the mouse (which the browser uses to let go of it) opens the hangar too; the hangar's choices are remembered between sessions (aircraft, base, start)
- Verified: 441 tests (1 skipped by design), typecheck, build, and headless Chrome: the hangar at load; choosing the Triplane, a paint and the carrier (it parked on the catapult); starting in the air; the old keys doing nothing in flight; Esc pausing (the aircraft didn't move) with RESUME; previewing the Heavy Bomber without touching the flight (its base switched to the airfield); settings applied and remembered; Enter after a crash; 60 FPS, no console errors

## Old-school aircraft, paint, base selection on a map ✅ (your request, 2026-11-18)

- ✅ **6 · Triplane**: three stacked wings with interplane and cabane struts, a rotary engine in a round cowling, a two-blade propeller, twin cowling guns, an open cockpit, fixed gear. 590 kg: stalls at 70 km/h, tops out near 200 km/h, turns inside anything; fragile (5.5 g)
- ✅ **7 · Biplane**: two staggered wings with N-struts, a radial engine, four guns, fixed gear; about 370 km/h, stalls at about 100 km/h, nimble
- ✅ Their physics: total wing area of all wings, a gentler lift slope for the short wings, Munk's span factor for the induced drag of stacked wings, lots of zero-lift drag (struts, wires, fixed gear), and approaches trimmed faster relative to the stall (they bleed speed quickly in the flare). Fixed gear never retracts. Nose-wheel steering fades early with speed (no tip-overs taxiing). Both have hooks, so they can use the carriers too. They pass the whole per-type test suite (take-off, loops, stalls, landings, carrier launch and trap, auto-land, steering, air brakes)
- ✅ The Interceptor has its own airframe now (it shared the Fighter-Bomber's): slim, a long pointed nose, a four-blade propeller, a small tapered wing, a bubble canopy and a tall narrow fin. The Fighter-Bomber carries bombs under its wings and fuselage (to look at; bombing comes later in Phase 4)
- ✅ Paint (**O**): ten schemes; each type starts in its own (Interceptor silver, Fighter-Bomber olive, Heavy Bomber black, Naval Fighter navy, Dive Bomber sky grey, Triplane yellow, Biplane green), so they're easy to tell apart. Your choice is remembered per type; the team colour stays on the spinner, fin, wingtips, band and roundels
- ✅ Base selection (**J**) is a map now: your bases ringed (the selected one pulsing), the enemy's dimmed; click a base to select it, click again or press TAKE OFF HERE (or ← → and Enter). The mouse is freed while it's open
- ✅ Test pilots fixed for slow aircraft (flare lower and always ease the sink); auto-land flares lower for slow aircraft and adds a little power if the speed sags towards the stall
- Verified: 441 tests (1 skipped by design), typecheck, build, and headless Chrome: every type flown from an air start (the old types with their gear fixed down); the Triplane holding height in a hard 6 s turn; paint cycling; the map picker selecting the carrier with a mouse click and starting the Fighter-Bomber on its catapult; 60 FPS, no console errors

## Take off from any of your bases ✅ (your request, 2026-11-17)

- ✅ **J** (stopped on the ground, on the catapult, or crashed) opens "TAKE OFF FROM": your bases (your airfield, your carrier, and any airfield you've captured), each in its owner's colour with what it is and how far. ← → choose, Enter: you start there, rearmed, ready to take off (on the catapult for a carrier). J closes it
- ✅ The base you choose becomes your base: R respawns you there, a new aircraft type (1-5) starts there, and landing practice (L) flies to it. A Heavy Bomber can't use a carrier (too big), so it starts at an airfield; a base you lose stops being your base
- ✅ HUD: "J · TAKE OFF FROM ANOTHER OF YOUR BASES (n)" when stopped; the crash panel offers J too
- ✅ Shared rule `startingBases` (the team's bases now, carriers only with a hook and not sinking), for the Phase 5 server: 2 tests. The land fighters pass the full carrier suite (catapult hold and launch, hands-off launch, traps): 8 more carrier tests
- Verified: 347 tests (1 skipped by design), typecheck, build, and headless Chrome: the prompt at spawn; J listing the airfield and carrier, then Red's airfield too once captured; taking off from Red's airfield; R and a new aircraft type starting there; the Fighter-Bomber choosing the carrier and launching off its catapult; the Heavy Bomber offered only airfields; J after a crash. No console errors

## Map, base beacons, carrier auto-land for fighters ✅ (your request, 2026-11-17)

- ✅ Map (**N**: corner → big → off, remembered): the islands from above (hill-shaded, from the real terrain), runways and carriers to scale, every base as a dot in its owner's colour (amber, blinking: defenceless; a cross: a sunk carrier), and you as an arrow. The big map labels the bases and has a legend. Pulled forward from Phase 6
- ✅ Base beacons: a 1.2 km column of light rising from every base in its owner's colour, drawn without fog and widened with distance, so it can be seen from anywhere on the map; it fades when you're close, blinks amber while an enemy base is defenceless, turns blue when you capture it, and goes out when a carrier sinks
- ✅ HUD base labels: the name and distance of every base beyond 1.2 km, in its owner's colour, just above it
- ✅ Fix: auto-land wasn't offered at the carrier when flying a land aircraft (only hooked types could use it). The Interceptor and Fighter-Bomber now carry an arrestor hook (as the real naval versions of land fighters did), so they can land on a carrier by hand or with auto-land; the hook only shows near a carrier. The Heavy Bomber (24 m span) is too big for the deck: near a carrier the HUD says so and offers the airfield
- ✅ 6 new carrier auto-land tests (Interceptor and Fighter-Bomber, three directions each)
- Verified: 337 tests (1 skipped by design), typecheck, build, and headless Chrome: labels for all four bases with distances; the map cycling corner, big, off; Red's base amber and "DEFENCELESS" once its defences were down; the Fighter-Bomber offered "AUTO-LAND at Blue carrier" and landed on it on a wire; the Heavy Bomber told it is too big; beacons visible in colour at 8-9 km; 58 FPS, no console errors

## Base rules: destruction sticks, capture repairs ✅ (your request, 2026-11-17)

- ✅ Nothing at a base rebuilds itself: a destroyed AA gun, hangar, fuel depot, radar or parked aircraft stays destroyed (a defenceless base stays defenceless). The carrier's gun comes back only with a new carrier after a sinking
- ✅ Capture repairs: everything at the base changes sides, and 30 s later its destroyed defences are rebuilt for the new owner; the AA gun then defends it for you (holds fire at Blue, fires at Red) and flies a blue flag. HUD: "crews repairing its defences", then "REPAIRED · its AA gun now defends it for you"; no red markers over your own base
- ✅ The radar moved beside the runway's north end (25 m off its edge), with a hit sphere reaching the ground: landing heading north (the way in from Blue's side), you stop about 340 m short of it, 7.5 degrees off the nose, and a short burst from the runway destroys it; stay stopped and the base is captured
- ✅ 6 new or changed tests: defences and parked aircraft stay destroyed for 10 minutes; a defenceless base stays so; a carrier gun returns only with a new carrier; capture repairs for the new owner; the repaired gun fires at Red, not Blue; the radar shot from the runway in under 4 s, then capture
- Verified: 331 tests (1 skipped by design), typecheck, build, and headless Chrome: five game minutes after destroying three defences they were still down; from a stop on Red's runway the radar sat ahead on the gunsight at 340 m and fell to one burst; capture followed, and 30 s later all four defences were back on Blue's side with the repaired status; no console errors

## Auto-land and retractable gear ✅ (your request, 2026-11-17)

- ✅ Auto-land (**P**): an autopilot in shared (`autoLand.ts`) that lands at the nearest base within 10 km, friendly or enemy (carriers only with a hook, never a sinking one). It picks the nearer runway end, joins the extended centreline like an ILS localizer (or flies out and turns back in a teardrop when too close or too high), stays 180 m above terrain on the way, slows down, lowers the flaps, flies the 3° glide slope, flares, touches down and brakes to a stop on the centreline. On a carrier it flies the slope into the deck (no flare) and catches a wire. Goes around if badly placed close in. P or any flight key takes over
- ✅ Landing at an enemy base works under the usual rules: no rearming there, and capture only once its defences are destroyed
- ✅ HUD: "P · AUTO-LAND at …" within 5 km of a base; while it flies, what it is doing (flying out, joining the approach, on final, flare, braking, wire caught); a message when it hands back control
- ✅ Retractable landing gear, automatic (`landingGear.ts`, in the flight model): up soon after take-off (or catapult launch), down when descending at landing speed low over the ground or near a base; stays down through a small climb on an approach; up when too fast for it. 3 s to travel. Down adds drag; up, there are no wheels, so touching down is a belly landing. The legs fold on the models (inward under the wing; aft into the nacelles on the Heavy Bomber; nose leg aft), and the HUD has a GEAR line
- ✅ 30 new tests: every class lands from 6 km out in under two minutes; U-turn onto the reverse runway; from abeam, low and fast; over the central mountain; teardrop after take-off; heavy bomber; enemy airfield; both carrier types onto the Blue carrier from three directions; the enemy carrier; base choice (range, hook, sinking); gear up after take-off and catapult launch, down before touchdown, stays up when fast and in cruise, drag, belly landing
- Verified: 326 tests (1 skipped by design), typecheck, build, and headless Chrome: take-off with the gear coming up at ~30 m (and never retracting on an approach); air start, P, auto-land to a 1.3 m/s "SMOOTH" touchdown and a stop with the rearm message; taking over with W; Naval Fighter auto-land onto the carrier, wire caught. 57-60 FPS, no console errors

## Easy steering and capturable bases ✅ (your request, 2026-11-17)

- ✅ Easy steering (default; K switches to direct roll): A/D turn the aircraft like a car. It banks and pulls into the tightest level turn, eases the air brakes out above the best turning speed, and on release rolls the wings level, anticipating, so it stops close to where you let go, then holds its height. W/S pitch as before. Shared `steerWithTurnInput`; 10 tests (90 degrees in under 4.5 s for fighters, height held, wings level after release)
- ✅ Quicker turns at every speed: wings stall at 18 degrees instead of 15 (about 18% more lift)
- ✅ Calmer mouse flight (between the original and the last version)
- ✅ Red's airfield redesigned: one big AA gun (quad 40 mm on a flak platform, 18 m flag), a hangar, a fuel depot and a radar station with a sweeping dish, plus the parked aircraft; the carrier has one AA gun
- ✅ Base capture (shared rules): destroy the AA gun, hangar, fuel depot and radar to make the base defenceless; land and stop on its runway for 5 s to capture it; it changes sides (its flag turns blue, you can rearm there, its old defences stay down); left alone, it rebuilds after 4 minutes. 5 tests
- ✅ HUD: base status line (defences left, defenceless, capturing %, captured), markers for every structure, capture messages
- Verified: 296 tests (1 skipped by design), typecheck, build, and headless Chrome: easy steering holds height in a 90-degree turn and levels on release; the base status counts down; destroying the defences, landing and stopping captures the base; rearmed there to a full 1,200 rounds. 58 FPS, no console errors

## Fixes: handling, aiming, air brakes ✅ (your feedback, 2026-11-17)

- ✅ Quicker turns: roll rates up about 35% and pitch response 20% (Heavy Bomber kept sluggish by design); fighter g-limits +1
- ✅ Mouse flight much quicker: a 90-degree turn in about 4-5 s (was 8), with no overshoot; it points the nose (the guns) at the aim, corrected for the rounds' drop
- ✅ Air brakes on every aircraft while B is held (slows you even at full throttle); wheel brakes on the ground as before
- ✅ Enemy targets easy to find and hit: bigger emplacements with tall red flags, bright muzzle flashes, red HUD brackets with distance, and an orange aim point where your rounds will hit the ground; ground targets' hit areas enlarged
- Verified: 281 tests (new: nose on target within 1.5 degrees for every class, air brakes slow every class at full throttle), and headless Chrome: air brakes 534 -> 434 km/h in 5 s at full throttle, markers on screen, one mouse-flight strafing pass destroys an AA gun (19 hits)

## Milestone: something to fight, sound, easier landings ✅ (your request, 2026-11-17)

- ✅ Red's defences (shared, deterministic): four AA guns at its airfield and four on its carrier (lead the target, slew at limited rates, fire bursts of 40 mm tracer), four parked aircraft, and the carrier itself. Everything takes damage, is destroyed, and respawns (practice rules until Phase 6)
- ✅ Rounds carry their team: no friendly fire. Aircraft have hit shapes from their airframes; AA hits damage your hull; at zero you're shot down (out of control, falls, crashes as "shot down")
- ✅ The Red carrier: armour halves gun damage; destroyed, it burns, sinks by the stern over about a minute (its deck stops being ground, its guns go down with it), and a fresh one returns after 3 minutes
- ✅ Effects: fire, smoke and explosions as sprites (two draw calls); burning wrecks; a smoke trail as your hull drops, flames when shot down; red-orange enemy tracers; screen-edge red flash and camera kick when hit
- ✅ Sound (Web Audio, all synthesised): engine per airframe type (four-engine beat), wind, your guns, AA "pom", explosions placed in 3D and delayed by the speed of sound, hit clanks, touchdown thump and tyre chirp, catapult whoosh, arrestor wire, stall horn, pull-up tone, dry click; **M** mutes
- ✅ Your fixes: wheel brakes on **B** (no more automatic brakes at idle); carrier landings made easier: ten wires over the first 125 m, the hook catches from just above the deck, a crash barrier stops anyone who misses, no ground-effect float over the deck, LSO calls on the HUD (also for the runway)
- Verified: 270 tests (1 skipped by design), typecheck, production build, and headless Chrome: AA fires red tracer and hits you, strafing destroys parked aircraft, the carrier burns and sinks, shot down by flak, sound level rises with the engine and guns, LSO calls and an early trap, B brakes to a stop. 60 FPS, no console errors

## Phase 0: Project foundation ✅

- ✅ Git repository initialised (`main` branch), `.gitignore`
- ✅ npm workspaces monorepo: `shared/` and `client/` (`server/` arrives in Phase 5)
- ✅ Vite 8 + TypeScript 7 (strict) + Babylon.js 9
- ✅ Basic scene: WebGL2 engine, capped device pixel ratio, resize handling
- ✅ Sky: custom gradient shader with sun disc; fog colour matched to the horizon
- ✅ Lighting: directional sun + hemispheric sky/ground fill, PBR materials
- ✅ Ground: 50 km plane with procedural, tiling farmland texture
- ✅ Runway (visual only) with procedural markings at the Blue home base
- ✅ Sun shadows from the aircraft, following it around the map
- ✅ Primitive aircraft: lathed fuselage, tapered wings, tail, canopy, 3-blade propeller, tricycle gear; team colours; 5 draw calls
- ✅ Third-person chase camera (smoothed orientation, follows roll, never below ground)
- ✅ Orbit inspection camera (mouse), toggled with **C**, never below ground
- ✅ Input manager with configurable bindings (physical key codes)
- ✅ Debug overlay (FPS, render CPU time, draw calls, meshes, resolution, state)
- ✅ Demo flight test fixture (**P**): parked → circuit → loop *(removed in Phase 1, replaced by real flight)*
- ✅ README, architecture doc, this checklist, known issues

**Verified by:** `npm run typecheck` (0 errors, plus a negative test to show it
catches errors), `npm run build`, and automated headless Chrome runs against
both the dev server and the production build. These ran every key path
(cameras, demo modes, orbit drag, overlay toggle, resize) and checked for zero
console errors, zero failed or external requests, and screenshots of each state.

## Phase 1: Flight simulator ✅

- ✅ Fixed-timestep simulation loop (60 Hz) with render interpolation (`FixedTimestepLoop`, `PlayerAircraft`)
- ✅ Shared maths (vectors, quaternions) without Babylon, pinned to Babylon's conventions by tests
- ✅ Aircraft state: position, velocity, acceleration, orientation, angular velocity, throttle (with spool lag), flow separation, hull health
- ✅ Three aircraft classes as data; stall speed, top speed, climb and max turn rate *derived*, not typed in
- ✅ Forces: thrust (propeller power model), lift (airspeed and AoA), drag (parasitic + induced + separated + sideslip), side force, gravity
- ✅ Exponential atmosphere: thinner air at altitude raises stall speed and cuts engine power
- ✅ Rotation: control moments, weathervane stability (pitch, yaw), damping, dihedral effect, g-limit
- ✅ Stall with hysteresis: lift collapse, nose drop, altitude loss, recovery; accelerated stalls
- ✅ Flight controls: W/S pitch, A/D roll, Q/E yaw, ↑/↓ throttle (decision D10), smoothed keyboard ramps
- ✅ Orbit camera mouse-only (arrow keys belong to the throttle)
- ✅ Cameras: chase (scaled per class), cockpit (airframe hidden, boresight), orbit
- ✅ HUD: airspeed, altitude, vertical speed, throttle, heading, AoA vs critical, g, status; STALL and PULL UP warnings; crash panel
- ✅ Respawn (R), air start (T), class select (1/2/3), help toggle (H)
- ✅ Vitest suite: 88 tests across maths, aerodynamics, performance and full flight tests for every class
- ✅ Manual procedure: [FLIGHT_TEST.md](FLIGHT_TEST.md); model explained: [FLIGHT_MODEL.md](FLIGHT_MODEL.md)

**Verified by:**
- `npm run typecheck` gives 0 errors; `npm test` gives 88 passed, 1 skipped (the heavy-bomber loop, by design), identical across repeated runs.
- `npm run build` passes.
- A headless-Chrome run flew a real flight with key presses: take-off roll, rotation, lift-off at 67 m/s, climb, banked turn, all cameras, an air-start stall with the STALL banner and recovery, PULL UP, a crash with its cause, respawn and class switching.
- That run held 60 FPS and 60 physics steps/s with zero console errors and zero failed or external requests.

## Phase 2: Takeoff and landing ✅

- ✅ Runway and grass as physical surfaces with different friction
- ✅ Wheel contact: spring-damper oleo struts sized per leg (sits level), progressive stiffening, extra rebound damping (no bouncing)
- ✅ Rolling resistance, wheel brakes (automatic at idle throttle), sideways tyre grip, nose-wheel steering
- ✅ Take-off run and rotation; landing and roll-out
- ✅ Crash detection: 12 airframe crash points, gear collapse, hard landing > 7.5 m/s (6.5 m/s Heavy Bomber)
- ✅ Hard-landing damage between 3 and 7.5 m/s, scaling up to 70% of hull; touchdown grading on the HUD
- ✅ Flaps: three notches (F/V); lift, drag, earlier stall, re-trim; blown up above 270 km/h; animated visual flaps
- ✅ Ground effect: the cushion in the flare
- ✅ Landing aids: flight-path marker, PAPI glide-slope lights, landing practice (L) with derived approach throttle
- ✅ Propeller spins up from stopped with the engine; blur disc at speed
- ✅ Team roundels on the wings and a fuselage band
- ✅ Chase camera raised so the runway stays visible over the aircraft on approach
- ⬜ Decide: a dedicated brake key, or keep auto-brake at idle (currently auto)

**Verified by:**
- 123 tests at Phase 2 completion, including a hands-off landing for every class: within 2.3 m of the glide slope, GOOD touchdown, no damage.
- Browser runs confirmed the propeller is static at start and spins up, flaps deflect and blow back, and L lands the Fighter-Bomber (2.5 m/s, GOOD) and the Heavy Bomber (2.3 m/s, GOOD) with no stick input.

## Phase 3: Graphics 🔄

- ✅ A distinct procedural model per aircraft type, built from shared airframe data (fighter, naval fighter, dive bomber, four-engine bomber)
- ⬜ Blender aircraft models (glTF), same origin and axes (Blender is not installed yet)
- ⬜ Environment map (IBL) for metallic paint
- 🔄 Post-process tone mapping (ACES), bloom, MSAA, vignette; sky shader outputs linear colour so it matches the fog. Renders correctly; tuning pending
- ✅ Procedural island terrain shared with the server; rock, sand and forest blended by slope and height; the sea (see the milestone above)
- 🔄 Clouds (sprite puffs, one draw call, fade when you fly into them)
- 🔄 Camera effects: field of view widens with speed (60° to 65° measured in a dive); shake from stall buffet, gunfire and high g
- Verified so far: typecheck, 158 tests, production build, and headless Chrome on the runway, an air start, over the mountains, into a cloud and in a firing dive. 60 FPS, 38–50 draw calls, no console errors

## Phase 4: Combat 🔄 (guns started early, at your request)

- ✅ Machine guns on **Space**: pooled projectiles, tracers, muzzle plus inherited velocity, gravity, overheating and cooldown
- ✅ Gun convergence at 300 m; deterministic dispersion; per-class guns (4 wing guns / 2 heavier nose guns)
- ✅ Swept hit detection (segment vs sphere), ground impacts with dust
- ✅ Practice balloons: hit sparks, bursts, respawn; HUD gunsight with hit flash, gun heat bar, OVERHEATED warning, TGT counter
- ✅ 14 combat tests (`shared/test/combat.test.ts`)
- ✅ Limited ammunition, rearming and repair at friendly bases (early, at your request); splashes where rounds hit the sea
- ⬜ Bombs: release, inherited velocity, ballistic fall, ground impact, area damage
- ✅ Hits on aircraft and hull damage (from AA guns now; from other aircraft when AI or a second player arrive)
- ✅ Damage effects: grey smoke below 60% hull, black smoke and fire below 30%, explosion when destroyed or crashed (debris: later)
- ⬜ HUD: health, gun heat, bomb count
- ✅ Procedural audio: engine, guns, explosions, warnings, mute (bomb whistle comes with bombs)

## Phase 5: Multiplayer ⬜

- ⬜ Colyseus server, rooms, room codes
- ⬜ Player spawning, input upload, authoritative simulation
- ⬜ State sync, prediction and reconciliation, remote interpolation
- ⬜ Combat synchronisation; disconnect and reconnect handling
- ⬜ Two-player test; measured bandwidth and tick timings

## Phase 6: Team battle ⬜

- ✅ Map with a Red base (airfield and carrier) opposite Blue's (early, with the island map)
- ⬜ Red and Blue teams; neutral central objective
- ✅ Base defences, destruction to defenceless, capture by landing (early, your request)
- ✅ Rearming and repair at your team's bases (early)
- ⬜ Forward spawning; rearming at captured bases
- ✅ AA guns (early, Red's side)
- ⬜ Team scoring; victory (all bases, or 25 kills)

## Phase 7: AI ⬜

- ⬜ Server-side FSM: takeoff, patrol, search, intercept, attack, base attack, avoid collision, retreat, land and repair
- ⬜ Terrain avoidance, lead aiming, bombing runs
- ⬜ One AI opponent, then 3 Blue + 4 Red

## Phase 8: Production ⬜

- ⬜ Lobby, matchmaking, aircraft selection
- ⬜ Player accounts, PostgreSQL stats, leaderboards
- ⬜ Settings screen (key rebinding, graphics, audio)
- ⬜ Deployment (static client + game server) with a self-hosted option
- ⬜ Performance testing with 10 players
