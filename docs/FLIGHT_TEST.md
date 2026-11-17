# Full flight test

A complete sortie, from cold start to landing, plus the failure cases. Every
card says what to do, what you should see, and what counts as a pass. The
same checks run automatically in `shared/test/` (`npm test`). This page is
the human version: it checks *feel*, which code can't.

Fly it with the **Fighter-Bomber** (the default) first, then repeat cards 3, 7
and 9 with the others (keys **1** / **2** / **3**).

## Setup

```bash
npm run dev          # open http://localhost:5173
```

The flight HUD is bottom-right: **SPD** (km/h), **ALT** (m above ground),
**V/S** (climb + / sink −), **THR** (throttle lever %), **FLAP** (lever
notch and actual position), **HDG**, **AoA** (current / critical, degrees),
**G**, **HULL**, **GUN** heat and **TGT** (balloons burst). Two symbols float
over the view:

- the **flight-path marker** (circle with wings), which marks where you are actually going;
- the **gunsight** (ring with a dot), which marks where your guns converge, 300 m ahead.

Press **`** for the debug overlay (lift/weight, thrust/drag, flow separation),
and **H** to hide the controls list.

| Key | Action |
|---|---|
| W / S | Pitch up / down |
| A / D | Roll left / right |
| Q / E | Rudder left / right (steers the nose wheel on the ground) |
| ↑ / ↓ | Throttle up / down. At idle (0%) the wheel brakes are on. |
| F / V | Flaps down / up one notch: UP → TAKE-OFF → LANDING |
| Space | Fire guns (hold) |
| Mouse | Click the view: fly with the mouse (aim circle). Esc releases |
| C | Camera: chase → cockpit → orbit |
| R | Respawn on the runway · **T** air start at 800 m · **L** landing practice |
| 1 / 2 / 3 | Interceptor / Fighter-Bomber / Heavy Bomber (respawns) |

Keys ramp the controls: a **tap** is a small correction, a **hold** is full
deflection (about 0.3 s to reach it). Fly with taps.

## Reference numbers

Measured from the flight model at sea level (full throttle, rotating at
1.1x stall speed to 10° nose-up).

| | Interceptor | Fighter-Bomber | Heavy Bomber |
|---|---|---|---|
| 0 → 100 km/h | 5.6 s | 7.2 s | 10.7 s |
| Rotate / lift-off speed | 176 / 208 km/h | 188 / 225 km/h | 197 / 239 km/h |
| Ground roll to lift-off | ≈ 310 m | ≈ 465 m | ≈ 800 m (runway is 1,200 m) |
| Stall speed (1 g), flaps up / landing | 159 / 140 km/h | 171 / 149 km/h | 179 / 152 km/h |
| Hands-off approach speed, landing flaps | 174 km/h | 182 km/h | 181 km/h |
| Throttle for a 3° glide slope, landing flaps | 13% | 19% | 32% |
| Flaps blow up above | 270 km/h | 270 km/h | 252 km/h |
| Hard-landing damage from / crash at | 3 / 7.5 m/s | 3 / 7.5 m/s | 2.5 / 6.5 m/s |
| Corner speed (best turn) | 451 km/h | 453 km/h | 336 km/h |
| Max turn rate | 35.6°/s | 31.0°/s | 20.2°/s |
| Top speed (sea level) | 598 km/h | 566 km/h | 471 km/h |
| Best climb | 32 m/s | 26 m/s | 14 m/s |
| Loops? | Yes | Yes | No: stalls near the top |

---

## Card 1: Pre-flight

**Do:** Load the page. Don't touch anything for 5 s. Then tap **↑** once (about 10%) and watch the propeller.
**Expect:** The aircraft sits level on the runway with the **propeller stopped**.
The HUD reads `ON GROUND · BRAKES`, SPD 0, THR 0%. After the tap, the
propeller winds up slowly over a second or two. At high power, the blades
blur into a translucent disc.
**Pass:** No drifting, no bouncing, no errors in the DevTools console.

## Card 2: Taxi and brakes

**Do:** Tap **↑** to about 20–25% THR. Once rolling, hold **E** for 2 s, then **Q** for 2 s. Then **↓** to 0%.
**Expect:** It rolls forward slowly. E turns right and Q turns left (nose-wheel
steering, strongest at low speed). At 0% the status shows `BRAKES` and it
stops within a few metres.
**Pass:** Turns the way you steer, stays on its wheels, stops at idle.

## Card 3: Take-off

**Do:** **R** to respawn. Hold **↑** until THR 100% (2 s). Keep the wings level. When SPD passes the *rotate* speed (≈190 km/h for the Fighter-Bomber), hold **W** briefly to raise the nose about 10°, then hold it there with taps.
**Expect:** Acceleration is brisk at first and tapers off. The nose lifts at
rotate speed, and the aircraft leaves the ground a little later (≈225 km/h),
not the instant the nose comes up.
**Pass:** Airborne with runway to spare. ALT climbs and V/S turns positive.
**Watch for:** pulling the nose up too early or too far. It lifts off,
can't hold the climb, and sinks back. That's correct behaviour.

## Card 4: Climb and level-off

**Do:** Climb at about 10° nose-up to 500 m. Then lower the nose to the horizon and reduce THR to about 60%.
**Expect:** V/S of +10 to +20 m/s in the climb. After levelling, SPD rises then
settles. Let go of the keys and it keeps flying: it may climb or sink
gently and swing slowly between them (the *phugoid*), but it doesn't flip,
roll away or stall.
**Pass:** Stable hands-off flight for 30 s.

## Card 5: Roll

**Do:** At around 350 km/h, hold **D** for a full 360° roll, then **A** back.
**Expect:** The roll rate builds in a fraction of a second and stops promptly
when released: about 1 s per 90° for the Fighter-Bomber, 0.75 s for the
Interceptor, 2.3 s for the Heavy Bomber.
**Pass:** It rolls about its own axis and doesn't stop on its own until you release.

## Card 6: Rudder, and "the nose isn't the direction of travel"

**Do:** In level flight, hold **E** for 2 s.
**Expect:** The nose swings right, but the aircraft keeps travelling roughly
straight at first: the debug overlay's *slip* angle builds to several
degrees. It also starts rolling right (dihedral effect).
**Pass:** The velocity visibly lags the nose; no instant change of direction.

## Card 7: Banked turn

**Do:** Bank 60° right (tap **D**), then hold **W** gently to keep V/S near 0.
**Expect:** HDG increases steadily and **G** reads about 2.0. Pull harder
and the turn tightens until the stall warning appears; ease off and it goes.
**Pass:** A controllable, level turn. The turn tightens as you add back pressure.

## Card 8: Loop (Interceptor, Fighter-Bomber)

**Do:** Dive slightly to build about 450 km/h, at full throttle. Wings level, then hold **W**.
**Expect:** The nose climbs through vertical, the aircraft goes over the
top upside down (the chase camera rolls with it) and comes back level, close
to the original heading. Speed bleeds off over the top and returns on the way down.
**Pass:** A complete loop. With the Heavy Bomber, expect it to stall near the top: it lacks the power and g.

## Card 9: Inverted flight

**Do:** At about 400 km/h, roll 180° (hold **A** or **D**) and stop upside down. Use **S** (push) to keep the nose on the horizon.
**Expect:** To hold altitude upside down you must *push*. The AoA read-out goes
**negative**, because the wing now has to lift "downwards" relative to itself.
**Pass:** Sustained inverted flight with roughly constant altitude.

## Card 10: Stall and recovery (the important one)

**Do:** Press **T** (air start, 800 m). Hold **↓** to idle. Hold **W** and keep holding it.
**Expect, in order:**
1. The nose rises and speed bleeds off. AoA climbs towards critical (15°).
2. **STALL** flashes as AoA nears critical.
3. The stall breaks: lift collapses (lift/weight drops well below 1 in the debug overlay).
   The aircraft sinks and **the nose drops by itself**, even with W still held.
4. Keep holding W and it porpoises: flow re-attaches, the nose rises, it stalls again.
   It does *not* recover while you hold the stick back.

**Recover:** Release **W**, tap **S** to lower the nose below the horizon,
hold **↑** to full power. Wait until SPD is comfortably above stall speed
(≈220 km/h for the Fighter-Bomber), then ease back gently to level.
**Pass:** The stall happens, the nose drops, height is lost, and recovery works.
**Common mistake:** pulling hard straight out of the dive re-stalls the wing (a
*secondary stall*). Real pilots make this mistake too.

## Card 11: Accelerated stall

**Do:** At about 300 km/h in level flight, yank **W** fully and hold it.
**Expect:** A brief stall warning or stall, even though you're well above stall speed.
**Pass:** Shows that stall depends on angle of attack, not just speed.

## Card 12: Landing practice (L), hands-off

**Do:** Press **L**. You start 2.5 km out on a 3° glide slope, lined up,
with landing flaps and the right throttle (a briefing shows the numbers).
**Don't touch anything** until about 4 m above the runway, then hold
**↓** to idle.
**Expect:** The aircraft flies itself down the slope at about 180 km/h.
The **PAPI** lights left of the runway show **2 red, 2 white** for most of
the way (closer than ~300 m they get twitchy, as real ones do; look at the
runway then). The flight-path marker sits on the touchdown zone. On
touchdown: `TOUCHDOWN ~2.3 m/s · GOOD`, no hull damage, and it brakes to a stop.
**Pass:** Lands undamaged on the runway with no stick input. Repeat with **3** (Heavy Bomber), then **L**.

## Card 13: Landing practice, flown

**Do:** Press **L** again and this time fly it. Use **W/S** taps to keep the
PAPI at 2 red / 2 white (more red: too low, so ease back; more white: too
high, so ease forward) and **↑/↓** to hold about 180 km/h. Over the runway
threshold, idle the throttle and ease back slightly to soften the touchdown
(the *flare*).
**Expect:** `SMOOTH` (< 1.5 m/s) or `GOOD` (< 2.5 m/s). `FIRM` or `HARD` cost hull
(the HULL readout drops). Only arrivals above 7.5 m/s destroy the aircraft.
**Pass:** Repeated landings grade GOOD or better.

## Card 14: Full circuit and landing

**Do:** Take off (card 3), climb to 300 m, turn left to heading 180° and fly about 3 km, then
turn back to 000° lined up with the runway. Below 270 km/h, press **F** twice
(LANDING flaps) and set the throttle to the approach value from the reference table. Descend
with the PAPI at 2 red / 2 white, put the flight-path marker on the touchdown zone, and flare.
**Expect:** As card 13, but you set it up yourself. Lowering flaps at speed: the FLAP
readout turns amber and the flaps stay up until you slow below 270 km/h.
**Pass:** Down and stopped on the runway.

## Card 15: Crashes and hard landings

| Do | Expect |
|---|---|
| Dive into the ground | `CRASHED. Cause: nose impact` (or propeller strike) |
| Touch down sinking 3–7.5 m/s | Survives: `TOUCHDOWN · FIRM/HARD · hull −N`, HULL drops |
| Arrive on the runway sinking faster than 7.5 m/s | `CRASHED. Cause: hard landing (x.x m/s sink rate)` |
| Touch down banked 60°+ | `wingtip strike` |
| Push the nose down on the ground at speed | `propeller strike` |

**Pass:** Each produces the crash panel with a sensible cause, and **R** respawns you on the runway.
**PULL UP** should flash before you hit the ground in a steep dive.

## Card 16: Gunnery

**Do:** Take off and fly north along the runway heading: six red-and-white
practice balloons float 1.8–5 km ahead at 180–450 m. (Or press **T** and
dive towards the nearest.) Put the **gunsight** on a balloon at about 300
m and hold **Space** in short bursts. With mouse flight, put the aim circle on it and fire.
**Expect:** Tracer streams from the guns (wings on the Interceptor and
Fighter-Bomber, nose on the Heavy Bomber) converge at the gunsight. Hits
spark and turn the gunsight red; eight hits burst a balloon (TGT counts up),
and it reappears 20 s later. Holding Space for ~8 s fills the GUN heat bar and
shows **GUNS OVERHEATED**: the guns stop until they cool to 40%. Rounds that
miss fall under gravity and kick up dust where they hit the ground.
**Pass:** You can burst balloons, the heat bar fills and recovers, and short bursts never overheat.

## Card 16b: Mouse flight

**Do:** Press **T** (air start), then **click the view**. Move the mouse
slowly right about a quarter turn, then left, then up and down. Press **Esc**.
**Expect:** The cursor disappears and a dashed **aim circle** appears; the
camera now looks where you aim, horizon level. The aircraft banks, pulls
round towards the circle and rolls out wings-level when its gunsight reaches
it, holding height (about 40 m lost in a 90° turn) and never stalling, even
if you yank the mouse at low speed. Holding W/S/A/D/Q/E overrides the mouse
on that axis. Esc returns to keyboard flight with the normal chase camera.
**Pass:** The aircraft goes where you point, smoothly, without wobbling or stalling.

## Card 16c: Moving surfaces

**Do:** On the runway, press **C** twice (orbit view) and drag round behind the
tail. Hold **D**, then **W**, then **E**; then press **F** twice. Repeat the
flaps with **3** (Heavy Bomber).
**Expect:** D raises the right aileron and lowers the left. W raises both
elevators. E swings the rudder's trailing edge right. Everything recentres
when released. The fighters' slotted flaps swing down about a hinge under the
wing, opening a slot. The Heavy Bomber's Fowler flaps also slide back.
**Pass:** Every surface moves the right way, smoothly.

## Card 17: Classes feel different

**Do:** Repeat cards 3, 7 and 16 with **1** (Interceptor) and **3** (Heavy Bomber).
**Expect:** The Interceptor leaps off the runway, rolls fast and turns tight.
The Heavy Bomber is a four-engined aircraft with a 24 m wing and needs most
of the runway. It rolls slowly, turns wide, and its nose takes time to
respond. It has 2 slower, harder-hitting nose guns that overheat sooner.
After touchdown, lower its nose gently or it floats.
**Pass:** They are clearly different and each fits its role.

## Card 18: Cameras and performance

**Do:** Press **C** repeatedly; in orbit view, drag and scroll; press **↑**/**↓** while in orbit.
**Expect:** Chase (rolls with you, looks over the aircraft) → cockpit
(airframe hidden; gunsight in the centre) → orbit (mouse). Arrow keys
change throttle in every view and never move the orbit camera. The orbit
camera can't go below the ground.
**Pass:** Debug overlay shows ~60 FPS (your display rate), *Physics* 60 steps/s, 0 dropped, including while firing.

## Card 19: The islands and the sea

**Do:** Press **T** (air start), climb to 1,500 m and look around; then fly
low along a coast.
**Expect:** "DOGFIGHT SQUADRON" along the top. Three islands: yours (runway),
the central one with a mountain (rock near the top, woods on its slopes,
fields on the plains) and Red's to the north. Sandy beaches, turquoise
shallows and surf; deep blue sea offshore with a sun glint; waves up close,
no rippling rings far away. Two carriers: Blue's west of your island, Red's
to the north-east.
**Pass:** No flicker along the coastlines, no water over land, about 60 FPS.

## Card 20: Catapult launch

**Do:** Press **4** (Naval Fighter). Push the throttle to full (**↑**, hold) and wait.
**Expect:** Status "ON CATAPULT"; flaps at TAKE-OFF. The aircraft doesn't
move until the throttle reaches full, then the catapult throws it off the
bow at about 200 km/h. Hands-off, it holds its height or climbs slowly;
pull gently to climb away. The hook stays up.
**Pass:** Airborne without touching the sea, every time. Try **5** (Dive Bomber) too.

## Card 21: Carrier landing

**Do:** As the Naval Fighter, press **L** and let go. Then fly one yourself:
take off, circle, and come back to the stern on a shallow approach with
landing flaps (**F** twice).
**Expect:** Landing flaps lower the hook. The **LSO** line under the title
calls distance, glide slope (ON GLIDE SLOPE / A LITTLE HIGH / LOW · POWER!)
and line-up (ON CENTRELINE / COME LEFT / COME RIGHT), then "CUT" over the
stern. Touch down anywhere in the first half of the deck: "HOOK CAUGHT A
WIRE" and a stop in about 50 m; "ON THE WIRE" until you idle (**↓**). Miss
every wire and the crash barrier (amber and black stripe, cables) stops you,
with some damage. Too low at the stern hits the hull.
**Pass:** The hands-off approach traps early in the wire zone. Flown, you get aboard most times.

## Card 22: Ammunition and rearming

**Do:** Hold **Space** until the guns run dry (watch AMMO, and let them cool
between bursts). Then fly to the base shown by BASE, land, stop and idle.
**Expect:** AMMO counts down; at 0 the guns go silent and "OUT OF AMMO · LAND
AT A BASE TO REARM" shows. Stopped at idle on your runway, its aprons or your
carrier's deck, "REARMING & REPAIRING" fills in 6 s, then AMMO is full and
the hull is 100%. Opening the throttle or rolling interrupts it. Red's bases
give nothing.
**Pass:** All of the above. Rounds fired into the sea throw up white splashes.

## Card 23: Dive brakes

**Do:** As the Dive Bomber, climb to 2,500 m, press **X**, then roll inverted
and pull into a steep dive at idle. Press **X** again in a second dive.
**Expect:** The brake plates open above and below the wings (visible in the
orbit view). With them out, the dive settles near 400–450 km/h; with them
in, the speed keeps climbing.
**Pass:** A clear, steady difference. **X** in other aircraft says they have no dive brakes.

## Card 24: The new aircraft side by side

**Do:** Press **1** to **5** in turn, with the orbit camera (**C** twice).
**Expect:** Five types: a slim inline-engined fighter (1, and 2 slightly
bigger), a four-engined bomber with turrets and a glazed nose (3), a
stubby radial-engined naval fighter with a tailhook (4), a two-seat dive
bomber with a long canopy and a rear gun (5). Carrier aircraft start on
the Blue carrier; the others on the island runway.
**Pass:** Each looks like its role.

## Card 25: Brakes

**Do:** On the runway, throttle up to start rolling, then idle (**↓**) and
coast; then hold **B**.
**Expect:** At idle without brakes it keeps rolling; holding B stops it
("ON GROUND · BRAKES"). After a runway landing the touchdown message reminds
you to hold B.
**Pass:** You can roll at idle, and stop when you want.

## Card 26: Red's AA and targets

**Do:** Fly to Red's airfield (north island) at 300 m, then strafe an AA gun
(sandbagged ring beside the runway) and the parked aircraft.
**Expect:** The guns open up within about 1.8 km: red-orange tracers. Hits
flash the screen edge red, kick the camera, clank, and cost hull. A good
burst knocks a gun out (explosion, then a burning wreck); the parked aircraft
burn the same way. Destroyed targets come back after 1.5 to 2 minutes.
**Pass:** The defences are dangerous but survivable for a pass or two; TGT counts what you destroy.

## Card 27: Sink the Red carrier

**Do:** Strafe the Red carrier (east of the Red island) deck and island,
rearm, come back and finish it.
**Expect:** "RED CARRIER HULL nn%" while you hit it; smoke below 70%, fires
below 35%. Destroyed, it explodes, blazes, and goes down by the stern,
listing, over about a minute, with its guns. Three minutes later a fresh
carrier is back.
**Pass:** As described, at about 60 FPS.

## Card 28: Sound

**Do:** Press any key (sound starts on the first input). Run the engine up,
fly, fire, get shot at, land; press **M**.
**Expect:** The engine pitch follows the propeller; radials sound rougher,
and the bomber's four engines beat. Wind rises with speed. Your guns, the AA's
"pom" and explosions come from where they happen; distant ones arrive late.
Stall horn and pull-up tone with the warnings. M mutes and unmutes.
**Pass:** No crackling, nothing missing.

---

## Reporting a problem

Note the **card number**, **aircraft class**, what you pressed, what you
expected and what happened. The HUD numbers at that moment help most (SPD,
ALT, AoA, G), plus the debug overlay if possible.

## Automated equivalent

| Card | Test in `shared/test/` (`flightTest.test.ts` unless named; runs for every class) |
|---|---|
| 1 | sits still on its wheels · rests level on its tricycle gear |
| 2 | steers right with right rudder · brakes to a stop |
| 3 | accelerates, rotates and lifts off · longer run on grass |
| 4 | climbs at full power · is stable hands-off |
| 5 | rolls at close to its configured roll rate |
| 6 | velocity lags behind a yaw · nose leads the flight path |
| 7 | turns right when banked right, at the rate physics predicts · respects its g-limit |
| 8 | loops (Interceptor, Fighter-Bomber) |
| 9 | flies inverted |
| 10–11 | stalls when the stick is held back · recovers when the nose is lowered |
| 12 | `landing.test.ts`: lands itself from the landing-practice start |
| 13–14 | `landing.test.ts`: with full flaps / without flaps · flaps blow back · flaps let it fly hands-off at approach speed |
| 15 | crashes and collisions · `landing.test.ts`: touchdown grading and hard-landing damage |
| 16 | `combat.test.ts`: rate of fire, overheating, ballistics, convergence, hit detection, ground impacts, respawn, determinism |
| 16b | `directionPilot.test.ts`: turns to 90°, turns round to 180°, climbs, can't stall, no wobble |
| all | flies a complete sortie · determinism · reaches its top speed · thin air at 6 km |
