# Development progress

Legend: ✅ done and verified · 🔄 in progress · ⬜ not started

**Current status:** Easy car-like steering, calmer mouse flight, and
capturable enemy bases are in (your request). Remaining in Phase 4: bombs.
Waiting for your test (FLIGHT_TEST.md cards 31-32) and confirmation.

## Extras added along the way

- ✅ Mouse flight: click to capture the mouse; the aircraft flies towards the aim circle, using the shared
  direction pilot (lift-vector pointing, achievable-turn cap, AoA limiter, load feedback). 15 tests.
- ✅ Moving control surfaces on both wings and the tail: ailerons, elevators, rudder (follow the inputs with actuator lag)
- ✅ Realistic flaps: slotted (hinged below the wing, rounded nose, hinge brackets) and Fowler (also slide aft) for the bomber
- ✅ Guns moved from X to Space
- ✅ Mouse sensitivity raised (0.2°/pixel) and adjustable in game with **[** / **]**; remembered between sessions
- ✅ Deployment config for Vercel: production build verified in headless Chrome (no errors; dev-only debug handle absent)

## Milestone: islands, carriers and new aircraft ✅ (your request, 2026-11-16)

- ✅ "Dogfight Squadron" title along the top of the screen (and the page title)
- ✅ Island map: three islands (Blue, Red, mountainous central) in the sea, ragged coastlines, beaches, woods on the hillsides, fields on the plains; runways on flattened pads with clear approaches. 9 tests
- ✅ Sea: one-pass custom shader. Turquoise shallows, deep blue offshore, surf, sky reflection, sun glint, waves that fade before they alias
- ✅ Two anchored carriers (Blue and Red): hull, deck markings, island with team band, arrestor wires, catapult, approach lights. Their decks are real ground; the island is solid; the sea is ditching
- ✅ Bow catapult (holdback, full throttle launches, 3 g over 45 m) and arrestor hook (arms in the air, catches a wire, holds until idle). 10 carrier tests, including "lands itself from carrier landing practice"
- ✅ Five aircraft types, each with its own shape built from shared airframe data: Naval Fighter (new), Dive Bomber (new, with dive brakes), Heavy Bomber (now four-engined, 24 m wing); Interceptor and Fighter-Bomber keep the fighter airframe. All pass the full flight test; both new types loop
- ✅ Limited ammunition per class; OUT OF AMMO warning; rearm and repair by stopping at idle on a friendly airfield or carrier (6 s). 8 tests
- ✅ HUD: AMMO count and bar, BASE distance and bearing (ON BASE), rearming progress, catapult and hook status
- Verified: typecheck, 258 tests (1 skipped by design), production build, and headless Chrome: spawn, island overview, coast, catapult launch, hands-off carrier landing (caught a wire, 2.0 m/s GOOD), out of ammo then rearmed on the deck, every new model, firing over the sea. 60 FPS at 1280x720, 52–71 draw calls, no console errors

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
