# Known bugs and technical limitations

Keep this list honest: add an entry as soon as something is known, and move it
to "Resolved" once it is fixed and verified.

## Open bugs

None known.

## Limitations (by design for now, with planned phase)

| # | Limitation | Impact | Planned |
|---|---|---|---|
| L3 | Faint flat band just below the horizon when inverted at altitude | Minor visual | Phase 3 (sky/clouds) |
| L4 | No environment map: metallic or glossy surfaces have nothing to reflect | Paint is kept non-metallic for now | Phase 3 |
| L7 | The ground shows the aircraft's shadow only within ~600 m of it | None in practice | By design |
| L8 | Render resolution is re-read only on window `resize`; moving between displays may not fire it | Slightly blurry or sharp until next resize | Later (`matchMedia` resolution listener) |
| L10 | Main JS chunk is 1.79 MB (437 KB gzipped), mostly Babylon.js; the post-processing pipeline and `@babylonjs/materials` added ~0.5 MB in Phase 3. Vite prints a chunk-size warning on build | ~0.4 s extra load on a slow connection; the warning is harmless | Phase 8 (code-split the rendering pipeline) |
| L11 | No Babylon Inspector, to keep dependencies light | Debug via the overlay and DevTools (`window.dogfight` in dev) | Add if Phase 3 material work needs it |
| L12 | Flight model omits wind and turbulence, propeller torque and P-factor, gyroscopic coupling, spins, ground effect and fuel burn ([FLIGHT_MODEL.md](FLIGHT_MODEL.md)) | Simpler than a full simulator; stalls don't auto-rotate into spins | Add any that gameplay wants |
| L13 | The Interceptor and the Fighter-Bomber share one airframe shape (the Interceptor is 8% smaller) | They look alike | Phase 3 (Blender models) |
| L14 | Cockpit view hides the player's airframe (no cockpit model yet) | No wing or nose reference in that view | Phase 3 |
| L15 | Keyboard only: no joystick, gamepad or mouse-aim flight | Fine control takes practice (taps) | Later, if wanted (Gamepad API) |
| L18 | No world boundary: you can fly past the 14 km playable area over open sea | Can wander off the map | Phase 6 (soft boundary) |
| L19 | The Heavy Bomber can't complete a loop: it stalls near the top | By design (power and g-limit) | None |
| L20 | No enemy aircraft yet: Red's AA guns shoot back, but nothing flies against you | No dogfights | Phase 7 (AI) or 5 (second player) |
| L22 | Hit detection uses analytic spheres and the world ground (terrain, sea, carrier blocks), not Rapier (decision D16) | Exact for balloons; aircraft and buildings need better shapes | When aircraft hit shapes arrive |
| L23 | Rounds have no air drag (gravity only) | Slightly flatter trajectories than real at long range | Add if gunnery feel needs it |
| L24 | Tracers are drawn at physics-step positions (not interpolated) | Possible slight shimmer on 120 Hz displays | Interpolate if noticed |
| L25 | PAPI lights become very sensitive inside ~300 m of the aim point (as real ones do) | Looks "high" or "low" in the last seconds | By design: look at the runway |
| L26 | Two presses of the same key within one frame (16 ms) count as one | Not reachable by hand (it did trip an automated test) | None |
| L28 | Mouse flight has no terrain avoidance: aiming at the ground flies into it | PULL UP still warns | Phase 7 (the AI needs ground avoidance anyway) |
| L29 | The mouse aim is limited to 80° above or below the horizon | No vertical loops by mouse alone; use W | By design (aim maths degenerate at vertical) |
| L30 | In cockpit view, mouse flight keeps the camera on the nose; the aim circle can leave the screen | Use chase view for mouse flight | Later, if wanted (free-look cockpit) |
| L31 | Moving control surfaces add 5 draw calls per aircraft (12 meshes per aircraft) | Fine for 10 aircraft | Merge or instance if profiling says so |
| L27 | Bombs not implemented yet | B does nothing | Phase 4 |
| L33 | Carriers are anchored: they don't sail, turn into the wind or leave a wake | Static targets and decks | Later (moving decks need moving-platform ground contact) |
| L34 | No wind, so no wind over the deck; the catapult gives 3 g to make up for it (WWII catapults gave less) | Launches are a little brisker than history | Revisit with wind (L12) |
| L35 | Only Red has AA guns, parked aircraft and a damageable carrier; Blue's bases can't be attacked (there's no enemy to attack them) | One-sided | Phase 6/7 |
| L36 | Every type has tricycle gear, including the Naval Fighter and Dive Bomber (historically tail-draggers) | Easier ground handling | By design (ARCHITECTURE D29) |
| L37 | Rearming also fully repairs the hull, in 6 s, at any friendly base | Generous | Phase 6 (repair and capture rules) |
| L38 | Carrier decks give no ground effect (the cushion would float aircraft past the wires) | Carrier approaches feel a little firmer than a runway's | By design (ARCHITECTURE D33) |
| L39 | The Heavy Bomber floats in ground effect after touchdown unless you lower the nose (its 24 m wing is 2 m off the runway) | Push gently after touchdown | By design (real big aircraft do this) |
| L40 | The sea reflects only the sky: no aircraft, island or ship reflections, no shadows on the water; the waves are shading on a flat surface | Looks right from the air; less so at wave-top height | Later, if wanted |
| L41 | Sea bed more than 1.5 m deep is drawn deeper than it is (hidden under the opaque sea), to stop depth-buffer flicker far away | None visible | By design |
| L42 | Sound is synthesised: convincing in the main but simple; no Doppler shift, and your own engine doesn't change between cockpit and chase views | Fine on laptop speakers | Later, if wanted |
| L43 | Sound starts only after your first key press or click (browser autoplay rules) | A silent title screen | By design |
| L44 | Destroyed things have no debris, only fire and smoke. Practice balloons come back after 20 s and a sunk carrier (with its gun) after 3 minutes; nothing at a base comes back unless the base is captured | By design (your request) | None |
| L45 | The AA has light guns only; no heavy flak bursting at altitude | High bombers are safe above about 1.5 km | Later, if wanted |
| L46 | Bombs now need a key other than B (B is the brake) | None yet | Phase 4 bombs |
| L47 | Air brakes on every type are a gameplay addition (most WWII fighters had none); only the Dive Bomber shows brake plates | Other types slow down with nothing visibly opening | By design |
| L50 | Wings stall at 18 degrees (real propeller-era wings: about 15) for quicker turns | Lower stall and landing speeds than history | By design (your request) |
| L51 | Captured bases stay captured for the session: Red has no aircraft to take them back. A captured base's parked aircraft are captured as they are (still in Red paint), and wrecked ones stay wrecks | One-way captures | Phase 6/7 (AI retakes) |
| L52 | Only the Red airfield can be captured; carriers are sunk instead | By design | None |
| L53 | Auto-land doesn't avoid other aircraft or flak: at an enemy base their AA gun keeps firing at you | Land at defended enemy bases at your own risk | Phase 7 (traffic) |
| L54 | Auto-land from high up or close in loops round to lose height or line up, so it can take 2-3 minutes; from a few km out on the approach side it takes about 90 s | Slower than flying it yourself | By design |
| L55 | The gear is automatic only (no lever), and travels in 3 s (real: 5-10 s). In a slow, low, descending dogfight turn it may come down until you climb or speed up | A little extra drag | By design |
| L48 | Handling is brisker than the real aircraft (roll rates about 35% up, fighters' g-limits +1) | Less historical | By design (your request) |
| L49 | The strafing aim point and the mouse drop correction assume a round at muzzle velocity with no drag; the wing guns converge at 300 m | Small errors beyond about 800 m | Fine at strafing range |
| L32 | Vercel hosts only the static client. Its free Hobby plan is for non-commercial use (about 100 GB transfer a month) and can't run the long-lived WebSocket game server | Fine for single-player; multiplayer needs another host | Phase 5 (self-host the Colyseus server; see README "Deploying") |

## Upcoming risks (decide before or during the relevant phase)

- **Browser key limits.** Some keyboards can't register many keys at once
  ("ghosting"), e.g. W+D+E+↑+Space. The arrow keys sit in a separate block,
  which helps. Test on real hardware when weapons arrive (Phase 4).
- **JavaScript engine float differences (Phase 5).** Chrome, Firefox and Safari may
  compute `Math.sin` and similar a hair differently from the Node server.
  The model is deterministic within one engine (tested); reconciliation is
  designed to absorb cross-engine drift.
- **Two Vite dev servers in one project share `client/node_modules/.vite`.**
  Starting a second one can rebuild the dependency cache under the first,
  which then answers `504 (Outdated Optimize Dep)` and the scene never
  finishes loading. Fix: stop all dev servers and run `npm run dev` once.
  (Automated tests now use a separate cache directory and port.)

## Resolved

| Issue | Found | Fix |
|---|---|---|
| Orbit camera could be dragged underground | Phase 0 browser test (camera at y = −4.9 m) | Beta limit computed per frame from target height and zoom (`CameraManager.keepOrbitAboveGround`) |
| Hard crease line along the horizon | Phase 0 screenshots | Sky gradient changed from `e^0.45` (infinite slope at the horizon) to `1 − (1 − e)^k` |
| 4% of the ground colour visible where the sky box cuts it off | Phase 0 screenshots | Far plane 25 km → 30 km, sky box 16.5 km, ground 50 km: >99.5% haze at the cut |
| Inverted aircraft rendered almost black | Phase 0 screenshots | Brighter ground-bounce fill light |
| `Quaternion.FromLookDirectionLH` would have pointed aircraft and cameras backwards | Numeric check before writing the camera | Own `lookRotationToRef()`, documented in ARCHITECTURE.md §8 |
| Ctrl as throttle-down: Ctrl+W closes the tab on Windows/Linux and can't be blocked | Phase 0 review | Throttle on ↑ / ↓ (ARCHITECTURE.md D10) |
| Orbit camera's arrow-key rotation would fight the arrow-key throttle | Phase 1 design | Orbit camera keyboard input removed; mouse only. Verified in the browser test |
| Parked aircraft sat 2° nose-up | Phase 1 browser test | Each gear leg's stiffness sized to its share of the weight; test "rests level" |
| Propeller strike under hard braking (nose leg bottomed out) | Phase 1 test suite, after the fix above | Progressive (oleo) strut stiffening, `strutProgression` |
| Cockpit view blocked by the fuselage cut open by the near plane | Phase 1 screenshot | Airframe hidden in cockpit view, boresight cross added |
| Stale g and AoA shown on the HUD after a crash | Phase 1 screenshot | Telemetry cleared on crash |
| Vite dependency cache broken by a second dev server started during testing | Phase 1 browser test (504 errors) | Stopped; tests now use an isolated cache and port 5174; recovery steps under "Upcoming risks" |
| Propeller turned slowly forever; looked wrong at rest and at speed (was L6) | User request, Phase 2 | Stopped at cold start, spins up with the engine, blur disc above ~8 rev/s |
| Touchdowns below the crash threshold did no damage (was L17) | Phase 2 brief | Damage from 3 m/s (2.5 Heavy Bomber), up to 70% of hull |
| Landing too hard: no flaps, no glide-slope cues, firm arrivals destroyed the aircraft | User feedback, Phase 2 | Flaps, ground effect, rebound damping, PAPI, flight-path marker, landing practice, damage instead of a crash below 7.5 m/s |
| Runway hidden behind the aircraft on short final in chase view | Phase 2 screenshot | Chase camera raised (5 m up, 17 m back) |
| Key-tapping test pilot crashed the landing practice | Phase 2 browser test | Practice now starts at the derived hands-off speed and throttle, so it holds the glide slope by itself |
| Left/right too slow and A/D rolls too twitchy (keyboard) | Your feedback | Easy car-like steering: A/D turn and the aircraft levels itself |
| Mouse flight too sensitive after the last change | Your feedback | Calmer gains, between the original and the previous version |
| Too many AA guns; wanted one big visible one, buildings, and capture | Your request | One flak-platform AA gun per base, hangar, fuel depot, radar; capture by landing |
| Turns and rolls too slow; mouse direction changes sluggish | Your feedback | Faster handling; mouse pilot pulls harder and rolls in faster (90 degrees in 4-5 s, was 8) |
| No way to slow down in the air | Your feedback | Air brakes on B for every type |
| Enemy guns hard to see and to hit | Your feedback | Flags, bigger emplacements, muzzle flashes, HUD markers, ground aim point, larger hit areas |
| Mouse flight aimed the flight path, so rounds went over targets; and they fell short in shallow dives | Browser strafing test | The pilot points the nose, and the aim is raised for the rounds' drop |
| Brakes were automatic at idle, with no brake key (was L16) | Your request | Wheel brakes on B; automatic braking off |
| Carrier landings too hard | Your feedback | Longer wire zone, hook reach, crash barrier, no deck ground effect, LSO calls; tests "hook catches from just above the deck" and "barrier stops a hookless aircraft" |
| Strafing tests aimed the flight path, not the guns, so rounds passed over the target | Combat browser test | Test fixed (not a game bug: the guns point along the nose and converge at 300 m) |
| AA guns barely hit anything | Hit-rate measurement per geometry | 4 rounds/s, tighter scatter, 8 damage: a battery takes a third to a half of a Fighter-Bomber's hull per pass |
| The lowered hook didn't reach below the wheels | Carrier tests | Hooks 1.7 m long, lowered 65 degrees |
| Terrain shader didn't compile (`vMainUV1` undeclared), so the scene never loaded | Phase 3 browser test | Splat coordinates from the world position (`vPositionW`) instead |
| Sea drawn over low coastal land when seen from altitude (white surf stripes across the island) | Islands browser test | Removed the water's polygon offset; deep sea bed pushed down in the render mesh instead |
| Approach lights 8 km away floated over the horizon as red boxes | Islands browser test | Lights only show inside their approach sector (±15°, < 9 km), like real PAPI optics |
| Hands-off catapult launch sank into the sea | Islands browser test | Carrier aircraft spawn with take-off flaps; catapult 3 g; test "flies away instead of sinking" |
| Heavy Bomber skipped back into the air after touchdown | Landing tests | Main gear moved aft (15% of weight on the nose wheel); test pilot lowers the nose after touchdown |
| Moiré rings on the sea at 1–3 km | Islands browser test | Each wave fades out by about 40 wavelengths away |
| Frame rate 47–58 FPS after adding the sea and carriers | Islands browser test | 16 approach-light meshes culled outside their sector; MSAA 4x to 2x: back to 60 FPS |
| Direction pilot dived into the ground turning to a target behind it | directionPilot tests | Errors split into heading (wrapped) and elevation; turns capped at the g the wing can deliver; load-factor feedback |
