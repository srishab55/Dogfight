# Dogfight: Architecture

This is the target architecture for the finished game, and the reasoning
behind it. Parts not built yet are marked with the phase that introduces them.
Update this file when a decision changes.

---

## 1. System overview

```
┌──────────────────────────── Browser (client) ────────────────────────────┐
│                                                                           │
│  Input ──► actions ──┬──► Local prediction (shared FlightModel, 60 Hz)    │
│                      │                │                                   │
│                      │                ▼                                   │
│                      │        Babylon.js rendering ◄── Interpolated       │
│                      │        (scene, cameras, FX)      remote aircraft   │
│                      │                ▲                       ▲           │
│                      │        HTML/CSS UI · Web Audio          │           │
│                      ▼                                        │           │
│              Network client ──── inputs (30 Hz) ────┐         │           │
│                      ▲                              │         │           │
└──────────────────────┼──────────────────────────────┼─────────┼───────────┘
                       │  WebSocket (Colyseus)        │         │
                       │                              ▼         │
┌──────────────────────┼──── Node.js server (authoritative) ────┼───────────┐
│                      │                                         │          │
│   Snapshots (20 Hz) ─┘      MatchRoom: fixed 30 Hz tick        │          │
│   (delta-encoded state)      ├─ apply queued player inputs     │          │
│                              ├─ shared FlightModel (60 Hz, 2 steps/tick)  │
│                              ├─ AI pilots (finite-state machines)         │
│                              ├─ projectiles, bombs, damage, bases, score  │
│                              └─ Rapier: collision and ray queries         │
│                                                                           │
│   Persistence (Phase 8): PostgreSQL, accounts, stats, leaderboards        │
└───────────────────────────────────────────────────────────────────────────┘
```

**The server is the only authority.** Clients send *what the player is
pressing*, never *where they are* or *what they hit*. The server simulates
everything and broadcasts the result. A modified client can therefore only
lie about its inputs, which the game already allows anyone to press.

## 2. Packages (npm workspaces monorepo)

| Package | Runs in | Contains | May import |
|---|---|---|---|
| `shared/` (`@dogfight/shared`) | Browser **and** Node | Config, types, math, **flight model**, combat rules, network protocol | Nothing engine-specific |
| `client/` (`@dogfight/client`) | Browser | Rendering, input, cameras, UI, audio, prediction and interpolation | `shared`, Babylon.js |
| `server/` (`@dogfight/server`, Phase 5) | Node.js | Colyseus rooms, authoritative simulation, AI, Rapier, persistence | `shared`, Colyseus, Rapier |

**Why a shared package is the cornerstone:** client-side prediction only works
if the client runs *the same* flight model as the server. If the flight model
lived inside the client, next to Babylon code, the server couldn't use it. So
the flight model is written once, in `shared/`, as plain TypeScript.

Two guards keep `shared/` portable:
- Its `tsconfig.json` has no `DOM` lib, so any use of `window` or `document` fails type-checking.
- It must not import Babylon.js. Its math uses plain `{x, y, z}` objects. (Phase 1
  will add an automated check, because npm's hoisting makes Babylon technically resolvable there.)

`shared` is consumed as TypeScript source (its `exports` points at `src/index.ts`).
Vite compiles it for the browser and `tsx` will run it in Node, so there is no
separate build step to forget.

## 3. Client module map

The 11 components from the brief map onto folders like this:

| # | Component | Location | Phase |
|---|---|---|---|
| 1 | Game rendering | `client/src/rendering/`, `core/Game.ts` | 0 ✅ |
| 2 | Aircraft flight simulation | `shared/src/flight/` (client and server) | 1 ✅ |
| 3 | Input handling | `client/src/input/` (`InputManager`, `FlightInputController`) | 1 ✅ |
| 4 | Camera management | `client/src/camera/` | 0 ✅ |
| 5 | Weapons and combat | `shared/src/combat/` (rules), `client/src/combat/` (visual effects) | 4 |
| 6 | Environment and terrain | `client/src/world/`, `shared/src/config/world.ts` | 0 ✅ / 3 |
| 7 | Multiplayer networking | `client/src/network/`, `server/`, `shared/src/protocol/` | 5 |
| 8 | AI behaviour | `server/src/ai/` | 7 |
| 9 | User interface | `client/src/ui/` (HTML/CSS over the canvas) | 0 ✅ / 4 / 8 |
| 10 | Audio | `client/src/audio/` (Web Audio synthesis) | 4 |
| 11 | Persistence and statistics | `server/src/persistence/` (PostgreSQL) | 8 |

Supporting folders: `config/` (all tunable numbers), `math/` (Babylon-side
helpers), `debug/` (test fixtures and dev tools).

## 4. Timing model

| Loop | Rate | Where | Notes |
|---|---|---|---|
| Physics step | 60 Hz fixed | client prediction and server | Same `dt` everywhere, so results match |
| Server tick | 30 Hz | server | Each tick: apply inputs, then 2 physics steps |
| State snapshots | 20 Hz | server to clients | Colyseus delta-encodes changed fields only |
| Input upload | 30 Hz | client to server | Each message carries the inputs of the last 2 physics steps |
| Rendering | Display rate (60–120 Hz) | client | Draws an interpolation between the last two physics states |

All of these live in `shared/src/config/simulation.ts`. The measured
physics rate appears in the debug overlay, so we measure it rather than assume it.

**Fixed timestep with accumulator (built in Phase 1: `client/src/core/FixedTimestepLoop.ts`).** Every frame, add the real elapsed
time to an accumulator. While it holds at least one 1/60 s step, run a physics
step and subtract it. Render the remainder as a blend `alpha` between the
previous and current physics states. Physics then stays stable and identical
whether the screen runs at 30 or 144 FPS.

## 5. Networking model (Phase 5)

- **Inputs, not positions.** Each input message is `{ seq, pitch, roll, yaw, throttle, fire, bomb }`, with control axes quantised to bytes.
- **Client-side prediction.** The local aircraft is simulated immediately from
  local input with the shared flight model, so controls feel instant despite latency.
- **Server reconciliation.** Snapshots include `lastProcessedInputSeq`. The client
  resets its aircraft to the server state, replays the inputs the server hasn't
  processed yet, and smooths out any small remaining error over ~100 ms rather
  than snapping.
- **Remote aircraft interpolation.** Other aircraft are drawn about 100 ms in
  the past, interpolating between buffered snapshots. They move smoothly and
  never "teleport" when packets arrive unevenly.
- **No lockstep determinism needed.** JavaScript engines may differ in the last
  bit of `Math.sin`. Reconciliation absorbs tiny divergences, so we don't need
  bit-identical simulation.
- **Bandwidth estimate** (to be measured): about 30 bytes per aircraft (position,
  compressed quaternion and velocity, health, flags) × 10 aircraft × 20 Hz ≈
  **6 KB/s per client** before delta compression.
- **Hit detection.** The server traces each bullet's path against aircraft hit
  shapes. Lag compensation (rewinding targets by the shooter's latency) is a
  Phase 5/6 decision. It favours the shooter, which feels right in a dogfight
  game, at the cost of occasional "hit after I dodged" moments.

## 6. Flight model (built in Phase 1)

Full explanation: [FLIGHT_MODEL.md](FLIGHT_MODEL.md). In short, a simplified
six-degrees-of-freedom rigid body in `shared/src/flight/`:

- `stepAircraft(state, controls, spec, ground, dt)` is a **pure, deterministic
  step**. The same inputs give a bit-identical result (tested), which client
  prediction in Phase 5 relies on.
- **Forces:** thrust (propeller power model), lift and drag from angle of
  attack and airspeed, fuselage side force, gravity, and ground contact
  (spring-damper wheels, tyre friction, nose-wheel steering, crash points).
- **Stall:** a flow-separation state with hysteresis gives lift collapse,
  nose drop, altitude loss and a recovery that needs the nose lowered.
- **Rotation:** pitch commands angle of attack (a damped spring towards a
  trimmed AoA), yaw weathervanes, roll is rate-damped. All scale with dynamic
  pressure and respect a g-limit.
- **Aircraft classes** are pure data (`shared/src/config/aircraftClasses.ts`). Headline performance
  (stall, top speed, climb, max turn rate) is *derived* in `flight/performance.ts`.
- **Seams for later phases:** `GroundQuery` (heightAt / surfaceAt) is where
  Phase 3 terrain plugs in. `FlightControls` holds absolute values, which is
  the Phase 5 network input.
- **Tests:** `shared/test/flightTest.test.ts` flies every phase of a sortie for
  each class; [FLIGHT_TEST.md](FLIGHT_TEST.md) is the matching manual procedure.

## 7. Weapons, collision and Rapier3D

**Guns (built early in Phase 4, `shared/src/combat/`).** `CombatWorld` runs
inside the fixed physics step:

- `stepGuns` handles heat, overheating and the rate of fire. Rounds leave each
  gun angled to converge at 300 m, with deterministic dispersion seeded from
  the round count, so client and server scatter identically.
- `ProjectilePool` (flat typed arrays, no per-round allocation) moves rounds
  under gravity. It tests each step's whole segment against target spheres
  and the ground, so fast rounds can't tunnel through.
- Results come out as `CombatEvent`s (ground impact, hit, destroyed). The
  client turns them into effects and HUD feedback. In Phase 5 the server
  broadcasts them instead.
- The client draws all rounds in one draw call (thin-instanced tracers).

**Rapier** is planned for **queries**, not for flying. For now, spheres and
flat ground are tested analytically: exact, cheap and dependency-free
(decision D16). Rapier comes in for:
- Ray and shape casts for bullets against aircraft hit shapes and static geometry (hangars, turrets, terrain).
- Blast-radius overlap queries for bombs.
- (Optional, client-only) rigid-body debris from destroyed aircraft.

Aircraft motion comes from our flight model. Ground contact (wheels, belly
landings) is computed against the terrain heightmap by the flight model
itself. That keeps it simple, fast and identical on client and server. We use
`@dimforge/rapier3d-compat`, which embeds its WebAssembly and works unchanged
in Vite and Node.

## 8. Conventions

**Units:** SI throughout: metres, seconds, kilograms, newtons, radians in code.
Config may use degrees and km/h for readability; convert at the boundary.

**Coordinates:** Babylon's default left-handed system, used unchanged in `shared/`:

| Axis | World | Aircraft local |
|---|---|---|
| +X | East | Right wing |
| +Y | Up | Canopy |
| +Z | North | Nose |

Headings are degrees clockwise from +Z (north).

**Babylon sign traps (verified numerically in Phase 0):**
- `rotation.x` positive pitches the nose **down**. `rotation.z` positive lifts the **right** wing (a left roll).
- `Quaternion.FromLookDirectionLH(forward, up)` maps local +Z to **−forward**. Use
  `lookRotationToRef()` in `client/src/math/orientation.ts` instead.
- Prefer quaternions and basis vectors to Euler angles in game code.

**Colour:** config colours are sRGB hex. PBR materials and light colours are
converted to linear space (`srgbHexToLinear`).

**Configuration:** every tunable number lives in a `config/` module, never
inline. Gameplay values the server needs go in `shared/src/config/`. Visual-only
values go in `client/src/config/`.

**Per-frame code allocates nothing:** reuse scratch `Vector3`/`Quaternion`
objects. Garbage-collection pauses show up as frame hitches.

## 9. Performance budget

Target: a steady 60 FPS on a MacBook Air (M-series, 8 GB) at native resolution,
with 10 aircraft and effects.

Measured in Phase 1 (Apple M3, Chrome, 1280×720, in flight): **60 FPS, 60
physics steps/s with 0 dropped, 12–13 draw calls, ~0.2–0.4 ms CPU render
time**. A physics step for one aircraft costs a few microseconds: the 88-test
suite simulates tens of minutes of flight in under half a second. Main bundle 1.16 MB (291 KB gzipped).

Rules: measure before optimising (debug overlay, Chrome Performance panel);
merge static meshes by material (each aircraft = 5 draw calls); pool bullets,
bombs and particles (Phase 4); keep shadow casters to aircraft only.

## 10. Deployment (Phase 8, to be confirmed then)

- **Client:** static files (`client/dist`). Any static host works: GitHub Pages,
  Cloudflare Pages and Netlify have free tiers.
- **Server:** a long-running Node process holding WebSockets. Free PaaS tiers
  often sleep idle services, so the first player waits for a cold start, and
  their limits change frequently. We'll re-check them at Phase 8.
- **Self-hosted alternative:** one small Linux VM or home server running Docker
  Compose (Node game server, PostgreSQL, and Caddy for automatic HTTPS / WSS).

## 11. Decision log

| # | Decision | Alternatives | Why |
|---|---|---|---|
| D1 | npm-workspaces monorepo with a `shared` package | Separate repos; single package | Prediction needs one flight model on client and server; workspaces are built into npm (no extra tool) |
| D2 | WebGL2 engine | WebGPU | Most mature Babylon backend, runs everywhere; WebGPU can be added later without a rewrite |
| D3 | Babylon deep imports (`@babylonjs/core/Meshes/mesh`) | Barrel import `@babylonjs/core` | Tree-shaking keeps the bundle smaller; Babylon 9's non-`.pure` paths include required side effects |
| D4 | Custom chase camera | Babylon `FollowCamera` | `FollowCamera` follows heading only, so it breaks in loops and inverted flight |
| D5 | Custom gradient sky shader | Babylon `SkyMaterial` | Horizon colour exactly equals fog colour, so no seam; one less dependency |
| D6 | Tricycle landing gear | Tail-dragger (more WWII-authentic) | Forgiving landings matter because landing is how bases are captured |
| D7 | Shadows from aircraft only, light follows the player | One map for the whole world | Sharp shadows at negligible cost; terrain self-shadowing is not worth it yet |
| D8 | Flight model owns ground contact; Rapier only for queries | Rapier rigid bodies for aircraft | The brief requires custom flight dynamics; also keeps client and server identical |
| D9 | No ESLint/Prettier yet | Add now | Strict TypeScript catches the important errors; revisit if formatting drift appears |
| D10 | Throttle on ↑ / ↓ arrow keys (user's choice, 2026-11-16) | Shift/Ctrl from the original brief | Ctrl+W closes the tab on Windows/Linux and pages can't block it; arrows also sit away from WASD, so they're less prone to key ghosting |
| D11 | Performance figures derived from physical inputs | Typing in stall speed, max turn rate etc. directly | Typed-in figures can contradict the physics; derived ones can't |
| D12 | Handling configured as response figures (frequency, damping ratio, roll rate) at a reference speed | Raw aerodynamic moment coefficients | Tunable by feel and testable; still scales physically with dynamic pressure |
| D13 | Wheel brakes automatic at idle throttle (replaced by D34) | A dedicated brake key | No key in the brief; intuitive for keyboard play. To be revisited in Phase 2 |
| D14 | Minimal ground handling (wheels, friction, brakes, crash points) pulled into Phase 1 | Air-start-only Phase 1 | A full flight test, take-off to landing, needs it. Phase 2 adds damage and refinements |
| D15 | Vitest 4.1 rather than 5.x | Vitest 5 | Vitest 5 requires Node 22, 24 or ≥26; the dev machine runs Node 25. Upgrade when on an LTS release |
| D16 | Analytic hit tests (segment vs sphere, ground height) for now; Rapier later | Rapier immediately | Exact and cheap for balloons; avoids a WebAssembly dependency until aircraft and buildings need complex shapes |
| D17 | Guns on **Space** (user moved them from X back to the brief's Space) | X | Player preference |
| D18 | Approach speed and throttle derived per class; landing practice uses them | Hand-tuned practice values | Same reasoning as D11; the "it lands itself" test keeps them honest |
| D19 | Hard landings below 7.5 m/s damage the hull instead of destroying the aircraft | Crash at 6 m/s | Makes landing learnable while keeping a cost for bad technique |
| D20 | Practice balloons as targets before AI exists | Wait for Phase 7 | Hit detection needs something to hit, visibly and in tests |
| D21 | Mouse flight: mouse sets an aim direction; a shared "direction pilot" turns it into stick inputs (War Thunder-style) | Mouse as a virtual joystick (offset = rate) | Point-and-fly is intuitive; the same pilot becomes the Phase 7 AI flight controller, and it's deterministic, so works with Phase 5 prediction |
| D22 | Control surfaces are visual and mirror the inputs; their aerodynamics stay in the handling model | Model each surface's force separately | The handling model already captures the effect; per-surface aero would add complexity with no gameplay gain |
| D23 | Each aircraft type's full geometry (shape included) is plain data in `shared/src/config/airframe.ts`; physics derives wheels, crash points and load shares from it, and the client builds the 3D model from the same numbers | Shapes in client config, physics points typed separately | One source of truth: what you see touching the ground is what collides. The server will build aircraft hit shapes from it (Phase 5) |
| D24 | One "world ground" for physics: terrain where it's above the sea, the sea surface elsewhere (touching it is ditching), carriers as solid blocks up to their deck, islands higher still (`createWorldGround`) | Rapier colliders for ships | Same `GroundQuery` interface, so the flight model didn't change; exact and deterministic. Anchored carriers only (L33) |
| D25 | Custom sea shader: sky-gradient reflection, a depth map baked once from the terrain, analytic waves | Babylon `WaterMaterial` | WaterMaterial re-renders the scene for reflection and refraction every frame (~2x draw cost), too much for a MacBook Air. One pass here |
| D26 | Carrier aircraft start on a bow catapult (holdback, full-throttle launch, 3 g) | A moving carrier steaming into wind; deck-run take-offs only | With no wind over an anchored deck, loaded aircraft need more than the deck to fly. The catapult is historically real and makes launches reliable |
| D27 | Arrestor hook as flight-model state plus a "wires" deck zone: arms in the air, catches on a main wheel in the zone, constant pull, holds until idle | Simulated cables | Deterministic and testable; feels right; the server runs the same code |
| D28 | Rearm and repair rules in shared (`stepService`): stopped, idle, on a friendly base, for 6 s | Client-only logic | The Phase 5 server must apply the same rules |
| D29 | Tricycle gear on every type, including the carrier aircraft | Historical tail-draggers | Forgiving ground handling for everyone (L36) |
| D31 | Every combat rule in shared: targets, AA guns (lead, slew limits, bursts), aircraft hit spheres, carrier sinking (a status the world ground reads) | AA as client-side scenery | The Phase 5 server runs the same; deterministic scatter keeps client and server in step |
| D32 | Rounds carry a team code; nothing is hit by its own side | Owner-only checks | Simple, and it will hold for Red and Blue players and AI alike |
| D33 | Easier carrier landings: wires over the first 125 m, hook reach below the wheels, crash barrier, no ground effect from decks, LSO calls | Realistic-only carrier ops | Your feedback: traps were too hard. Each aid is real (barriers, LSOs), bar the missing deck ground effect |
| D34 | Wheel brakes on B; no automatic brakes at idle | Auto-brake (D13) | Your request; lets you roll freely at idle (IL-2 uses B too) |
| D35 | Sound synthesised with Web Audio (oscillators, filtered noise, generated buffers) | Recorded samples | Free, nothing to download or license, and it follows the simulation continuously |
| D36 | Smoke, fire and explosions as pooled sprites (two sprite managers) | Babylon particle systems | Two draw calls for everything burning; particles never allocated during play |
| D37 | Easy steering is the direction pilot with a target that leads the flight path sideways while A/D are held (and anticipates the roll-out on release) | A separate arcade turn model that rotates the velocity directly | The turn stays physical (bank and pull, speed bleeds), so it behaves the same for the server and the AI; one pilot to maintain |
| D38 | Base capture in shared (`baseControl.ts`): defences all down, then an enemy aircraft stopped on the runway for 5 s; ownership drives rearming via an owner lookup | Client-side capture | Server-authoritative later, and the same rules for Phase 6 teams and AI |
| D39 | Auto-land is a shared autopilot (`autoLand.ts`) that only chooses control positions; the flight model flies the aircraft. Phases: intercept (localizer-style join, or teardrop), final (carrot on the glide slope), flare, roll-out | Scripted/teleported landing | Physical and deterministic, so the Phase 5 server and Phase 7 AI can use it; the player can take over at any moment |
| D40 | Landing gear moves automatically by flight-model rules (`landingGear.ts`); no gear lever | A gear key to forget | Your request ("close it soon after take-off, back down near the runway"); deterministic, so it's the same on the server. Gear-up touchdowns are belly landings, so the rules extend it generously |
| D41 | Nothing at a base rebuilds itself; capturing it switches every target there to the new owner and repairs its defences for them after 30 s (`baseControl.ts`). Targets carry a mutable team and a time-since-destroyed | Timed respawns | Your request: destruction should stick, and capture should be the way to get a working base. The rule is symmetric, ready for Red retaking bases (Phase 6/7) |
| D30 | MSAA 2x in the post-process pipeline | 4x | Indistinguishable on Retina; measured ~1 ms a frame cheaper, keeping 60 FPS with the sea and carriers |
