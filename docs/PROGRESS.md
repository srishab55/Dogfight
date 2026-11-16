# Development progress

Legend: ✅ done and verified · 🔄 in progress · ⬜ not started

**Current status:** Phase 3 (graphics) in progress: terrain, clouds, tone
mapping and camera effects are in and render at 60 FPS. The glTF aircraft
model and visual tuning remain. Phase 4 (combat) has started with guns.
The client is set up for Vercel deployment (`vercel.json`).

## Extras added along the way

- ✅ Mouse flight: click to capture the mouse; the aircraft flies towards the aim circle, using the shared
  direction pilot (lift-vector pointing, achievable-turn cap, AoA limiter, load feedback). 15 tests.
- ✅ Moving control surfaces on both wings and the tail: ailerons, elevators, rudder (follow the inputs with actuator lag)
- ✅ Realistic flaps: slotted (hinged below the wing, rounded nose, hinge brackets) and Fowler (also slide aft) for the bomber
- ✅ Guns moved from X to Space
- ✅ Mouse sensitivity raised (0.2°/pixel) and adjustable in game with **[** / **]**; remembered between sessions
- ✅ Deployment config for Vercel: production build verified in headless Chrome (no errors; dev-only debug handle absent)

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

- ⬜ Blender aircraft model (glTF), same origin and axes as the primitive model (Blender is not installed yet)
- ⬜ Environment map (IBL) for metallic paint
- 🔄 Post-process tone mapping (ACES), bloom, MSAA, vignette; sky shader outputs linear colour so it matches the fog. Renders correctly; tuning pending
- 🔄 Procedural terrain shared with the server (hills, mountain ring, flattened airfield corridors); rock, snow and forest blended by slope and height. 6 tests; renders correctly
- 🔄 Clouds (sprite puffs, one draw call, fade when you fly into them)
- 🔄 Camera effects: field of view widens with speed (60° to 65° measured in a dive); shake from stall buffet, gunfire and high g
- Verified so far: typecheck, 158 tests, production build, and headless Chrome on the runway, an air start, over the mountains, into a cloud and in a firing dive. 60 FPS, 38–50 draw calls, no console errors

## Phase 4: Combat 🔄 (guns started early, at your request)

- ✅ Machine guns on **Space**: pooled projectiles, tracers, muzzle plus inherited velocity, gravity, overheating and cooldown
- ✅ Gun convergence at 300 m; deterministic dispersion; per-class guns (4 wing guns / 2 heavier nose guns)
- ✅ Swept hit detection (segment vs sphere), ground impacts with dust
- ✅ Practice balloons: hit sparks, bursts, respawn; HUD gunsight with hit flash, gun heat bar, OVERHEATED warning, TGT counter
- ✅ 14 combat tests (`shared/test/combat.test.ts`)
- ⬜ Bombs: release, inherited velocity, ballistic fall, ground impact, area damage
- ⬜ Aircraft-vs-aircraft hits and hull damage (needs other aircraft: AI or a second player); Rapier for complex hit shapes
- ⬜ Damage effects: white smoke < 60%, dark smoke and fire < 30%, explosion and debris at 0
- ⬜ HUD: health, gun heat, bomb count
- ⬜ Procedural audio: engine, guns, bomb whistle, explosion, warnings; mute

## Phase 5: Multiplayer ⬜

- ⬜ Colyseus server, rooms, room codes
- ⬜ Player spawning, input upload, authoritative simulation
- ⬜ State sync, prediction and reconciliation, remote interpolation
- ⬜ Combat synchronisation; disconnect and reconnect handling
- ⬜ Two-player test; measured bandwidth and tick timings

## Phase 6: Team battle ⬜

- ⬜ Red and Blue teams; Red base; neutral central airfield
- ⬜ Base health, destruction to neutral, capture by landing
- ⬜ Forward spawning, repair, rearming at captured bases
- ⬜ AA turrets; team scoring; victory (all bases, or 25 kills)

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
