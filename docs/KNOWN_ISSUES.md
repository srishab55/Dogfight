# Known bugs and technical limitations

Keep this list honest: add an entry as soon as something is known, and move it
to "Resolved" once it is fixed and verified.

## Open bugs

None known.

## Limitations (by design for now, with planned phase)

| # | Limitation | Impact | Planned |
|---|---|---|---|
| L2 | Flat ground; one 400 m texture tile visibly repeats when seen from altitude | Looks artificial from high up | Phase 3 (terrain + macro variation) |
| L3 | Faint flat band just below the horizon when inverted at altitude | Minor visual | Phase 3 (sky/clouds) |
| L4 | No environment map: metallic or glossy surfaces have nothing to reflect | Paint is kept non-metallic for now | Phase 3 |
| L5 | No tone mapping. PBR tone mapping would make the fog colour mismatch the (un-tone-mapped) sky | Slightly flat contrast | Phase 3 (whole-screen post-process instead) |
| L7 | The ground shows the aircraft's shadow only within ~600 m of it | None in practice | By design |
| L8 | Render resolution is re-read only on window `resize`; moving between displays may not fire it | Slightly blurry or sharp until next resize | Later (`matchMedia` resolution listener) |
| L10 | Main JS chunk is 1.75 MB (424 KB gzipped), mostly Babylon.js; the post-processing pipeline and `@babylonjs/materials` added ~0.5 MB in Phase 3. Vite prints a chunk-size warning on build | ~0.4 s extra load on a slow connection; the warning is harmless | Phase 8 (code-split the rendering pipeline) |
| L11 | No Babylon Inspector, to keep dependencies light | Debug via the overlay and DevTools (`window.dogfight` in dev) | Add if Phase 3 material work needs it |
| L12 | Flight model omits wind and turbulence, propeller torque and P-factor, gyroscopic coupling, spins, ground effect and fuel burn ([FLIGHT_MODEL.md](FLIGHT_MODEL.md)) | Simpler than a full simulator; stalls don't auto-rotate into spins | Add any that gameplay wants |
| L13 | All three classes use the same primitive airframe, scaled (bomber 1.45x) | They look alike apart from size | Phase 3 (Blender models per class) |
| L14 | Cockpit view hides the player's airframe (no cockpit model yet) | No wing or nose reference in that view | Phase 3 |
| L15 | Keyboard only: no joystick, gamepad or mouse-aim flight | Fine control takes practice (taps) | Later, if wanted (Gamepad API) |
| L16 | Brakes are automatic at idle throttle; there is no brake key | Can't roll freely at idle on the ground | Decide when play-testing |
| L18 | No world boundary: you can fly past the 12 km playable area (the ground continues to 25 km) | Can wander off the map | Phase 6 (soft boundary) |
| L19 | The Heavy Bomber can't complete a loop: it stalls near the top | By design (power and g-limit) | None |
| L20 | Only practice balloons can be hit; aircraft have no hit shapes yet | Nothing shoots back | Phase 4/7 (AI) or 5 (second player) |
| L21 | No sound yet: no engine, guns or warning tones | Silent | Phase 4 (Web Audio) |
| L22 | Hit detection uses analytic spheres and flat ground, not Rapier (decision D16) | Exact for balloons; aircraft and buildings need better shapes | When aircraft hit shapes arrive |
| L23 | Rounds have no air drag (gravity only) | Slightly flatter trajectories than real at long range | Add if gunnery feel needs it |
| L24 | Tracers are drawn at physics-step positions (not interpolated) | Possible slight shimmer on 120 Hz displays | Interpolate if noticed |
| L25 | PAPI lights become very sensitive inside ~300 m of the aim point (as real ones do) | Looks "high" or "low" in the last seconds | By design: look at the runway |
| L26 | Two presses of the same key within one frame (16 ms) count as one | Not reachable by hand (it did trip an automated test) | None |
| L28 | Mouse flight has no terrain avoidance: aiming at the ground flies into it | PULL UP still warns | Phase 7 (the AI needs ground avoidance anyway) |
| L29 | The mouse aim is limited to 80° above or below the horizon | No vertical loops by mouse alone; use W | By design (aim maths degenerate at vertical) |
| L30 | In cockpit view, mouse flight keeps the camera on the nose; the aim circle can leave the screen | Use chase view for mouse flight | Later, if wanted (free-look cockpit) |
| L31 | Moving control surfaces add 5 draw calls per aircraft (12 meshes per aircraft) | Fine for 10 aircraft | Merge or instance if profiling says so |
| L27 | Bombs not implemented yet | B does nothing | Phase 4 |
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
| Direction pilot dived into the ground turning to a target behind it | directionPilot tests | Errors split into heading (wrapped) and elevation; turns capped at the g the wing can deliver; load-factor feedback |
