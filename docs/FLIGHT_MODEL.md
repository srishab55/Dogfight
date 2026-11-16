# Flight model

How the aircraft fly, and why. The code is `shared/src/flight/`; every
formula there is commented. This page is the overview.

## The one-paragraph version

Each aircraft is a rigid body with position, velocity, orientation and
angular velocity, advanced in fixed 1/60 s steps. Every step adds up the
forces: **thrust** (propeller), **lift** and **drag** (both depend on airspeed
squared and on the **angle of attack**), **side force**, **gravity**, and
**ground contact**. Newton's a = F/m then moves it. Rotation comes from the
controls fighting the aircraft's natural **stability** and **damping**. The
aircraft goes where its *velocity* points; the nose only bends the velocity
round gradually, through lift.

## Angle of attack is everything

Angle of attack (α) is the angle between the nose (strictly, the wing) and the
airflow. Lift grows with α:

```
CL(α) = CL0 + slope × α            (attached flow, up to the critical angle ~15°)
Lift  = ½ ρ V² × S × CL             (ρ = air density, V = airspeed, S = wing area)
```

So lift needs *both* speed and angle. Slow down and the wing must fly at a
higher α to make the same lift. Below a certain speed it can't without
passing the critical angle: that's the **stall speed**,
Vs = √(2W / (ρ S CLmax)).

## The stall

Past the critical angle, airflow separates from the wing. The model tracks a
**flow separation** value (0 = attached, 1 = stalled) as part of the aircraft
state:

- It rises within about 0.12 s once α exceeds critical.
- It only falls again once α is 3° *below* critical (**hysteresis**), and more slowly.
- Lift blends towards a flat-plate curve, CL = 1.1 × sin 2α, about half the
  lift just past the stall. Drag rises sharply.
- The tail sits in disturbed air (elevator authority −50%), the ailerons lose bite, and
  an extra nose-down moment acts.

The result: lift collapses, the aircraft sinks, the nose drops on its own,
and recovery needs the nose lowered *and* speed rebuilt. Holding full back
stick gives a porpoising cycle of stall, partial recovery and stall again,
as in a real aircraft. Because stall depends on α rather than speed, a hard
pull at high speed can also stall the wing (an **accelerated stall**).

## Drag, thrust, and where top speed comes from

```
CD = CD0 + CL² / (π e AR) + separation drag + sideslip drag
Thrust = throttle × min(static thrust, η × power / V) × (ρ / ρ0)
```

Parasitic drag CD0 dominates at high speed; *induced* drag (the CL² term)
dominates when slow or pulling hard. A propeller turns roughly constant power
into thrust that falls as speed rises. Top speed is where thrust equals drag;
best climb is where (thrust − drag) × V is largest.

## Rotation: why the controls feel like an aircraft

Each axis is configured as *handling figures* at a reference speed, and
everything scales with dynamic pressure (½ρV²):

| Axis | Model | Feel |
|---|---|---|
| Pitch | A damped "spring" pulls α towards a trimmed value; the elevator moves the target. Full back stick targets ~18°, past the stall. | The stick commands angle of attack, so pulling harder means more g. Mushy when slow, crisp when fast. |
| Yaw | The fin weathervanes the nose into the airflow; the rudder offsets it. Sideslip also creates a side force and rolls the aircraft (dihedral). | The rudder yaws the nose, the aircraft slips, then the flight path follows. |
| Roll | Ailerons against roll damping give a steady roll rate. | A crisp, constant roll rate while held. |

A **g-limit** fades out back pressure above each class's limit (8 g
Interceptor, 7 g Fighter-Bomber, 3.5 g Heavy Bomber), standing in for pilot
and airframe limits.

## Ground contact

Three wheels, each a spring-damper leg (an oleo strut) sized to carry its share
of the weight, so the aircraft sits level. The struts stiffen as they
compress, so heavy braking can't bottom out the nose leg. Tyres have rolling
resistance (runway 0.02, grass 0.07), brakes and sideways grip. The nose wheel
steers with the rudder. Twelve "crash points" (propeller tips, wingtips, belly,
tail, nose…) end the flight if any of them touches the ground. Touching down
faster than 6 m/s vertically, or compressing a leg past its limit, is a crash.

## Flaps

Three notches (UP, TAKE-OFF 50%, LANDING 100%) on **F** / **V**. The flaps
travel at a fixed rate (2.5–4 s end to end), so the lever and the actual
position differ for a moment. At full deflection they:

- add about **+0.6 to C<sub>L</sub>** at every angle of attack, which lowers stall speed by 12–15%;
- add drag (ΔC<sub>D0</sub> ≈ 0.035), so you can descend steeply without gaining speed;
- stall about 2° earlier;
- **re-trim** the aircraft 3° nose-up hands-off, as a real pilot would with trim. With
  landing flaps it therefore settles at roughly approach speed without you
  holding the stick.

Above 270 km/h (252 for the Heavy Bomber) the airflow blows them back up. The
HUD turns the FLAP readout amber.

## Ground effect

Within about one wingspan of the ground, the ground blocks the wing's
downwash. Induced drag falls and lift rises a little: the cushion you feel in
the flare. McCormick's approximation is used: induced drag × φ, with
φ = (16h/b)² / (1 + (16h/b)²), plus up to 30% extra lift as φ → 0.

## Landings, damage and the approach

- **Touchdowns are graded** on the HUD: SMOOTH < 1.5 m/s, GOOD < 2.5, FIRM < 4, HARD.
- **Hull damage** starts at 3 m/s sink (2.5 for the Heavy Bomber) and rises steeply to 70% of
  the hull just under the crash threshold of 7.5 m/s (6.5).
- **Struts** stiffen as they compress and are damped harder on rebound, so a firm
  arrival sticks instead of bouncing back into the air.
- **Approach figures are derived.** `performance.ts` computes the hands-off speed
  with landing flaps, and the throttle that holds a 3° glide slope there:
  T = D − W·sin 3°. Landing practice (**L**) starts with exactly those, so left
  alone the aircraft flies the slope to the aim point (tested within 2.3 m
  for all three classes).

## The direction pilot (mouse flight, later the AI)

`flight/directionPilot.ts` turns "fly towards this direction" into stick
inputs the way a pilot does, by **pointing the lift vector**:

1. Split the error into heading (horizontal, ±180°) and elevation, and choose
   a turning acceleration towards the target. It is capped at what the wing
   can deliver right now: a = g·√(n² − 1), with n from the lift curve at
   (critical AoA − 4°) and the g-limit.
2. Wanted lift = that turn + 1 g up (against gravity).
3. Roll until the wings' lift axis points along it.
4. Pull the angle of attack that produces that much lift (inverting the lift
   curve and the pitch law), corrected by load-factor feedback, and never
   past the AoA ceiling.

Target dead ahead: the turn term is zero and lift is "1 g up", so it flies
wings-level at constant height without a special case. Tests:
`directionPilot.test.ts` (90° and 180° turns, climbs, can't stall, no wobble).

## Derived performance

Headline figures are **computed** from the physical configuration
(`flight/performance.ts`), never typed in separately, so they can't
contradict each other. `npm test` prints this table:

| Class | Stall km/h | Top km/h | Climb m/s | Max turn °/s | Corner km/h | T/W | Wing loading Pa |
|---|---|---|---|---|---|---|---|
| Interceptor | 159 | 598 | 32.4 | 35.6 | 451 | 0.60 | 1626 |
| Fighter-Bomber | 171 | 566 | 26.0 | 31.0 | 453 | 0.47 | 1875 |
| Heavy Bomber | 175 | 457 | 15.7 | 20.7 | 328 | 0.33 | 1962 |
| Naval Fighter | 156 | 496 | 22.0 | 35.2 | 427 | 0.53 | 1556 |
| Dive Bomber | 158 | 414 | 12.3 | 32.3 | 402 | 0.40 | 1592 |

The Naval Fighter trades top speed for the lowest stall speed (a big wing for
its weight): short take-offs and slow carrier approaches. The Dive Bomber is
the slowest climber but turns well; its dive brakes are what make it a dive
bomber (below).

To change a class, edit `shared/src/config/aircraftClasses.ts` and run `npm test`.
The tests check the class still matches its brief (e.g. the Interceptor stays the
fastest and best-turning).

## Carrier operations

**The deck** is ordinary ground to the flight model (see `worldGround.ts`):
the carrier is a solid block up to its deck height, with the island higher
still. Touching the sea is ditching.

**Catapult.** A carrier aircraft spawns held on the bow catapult by a
holdback bar, which cancels its thrust while the engine runs up. With the
throttle lever and the engine both at 95%, the catapult fires: an extra
3 g along the deck for 45 m. The aircraft leaves the bow at about 200 km/h
with take-off flaps set, fast enough to hold its height hands-off.

**Arrestor hook.** The hook arms after a second in the air, so a take-off
roll across the wires can't catch one. When a main wheel rolls across the
wire zone (22 to 92 m from the stern), it catches: a constant pull of
about 1.6 g back along the deck, plus whatever the engine is pushing,
stops a 160 km/h arrival in roughly 50 m. Pilots hold power on touchdown
in case they miss the wires (a "bolter"), and the wire holds a stopped
aircraft until the throttle comes back to idle.

**Landing practice to the carrier** uses the same derived hands-off speed
and throttle as the runway. It aims just past the first wire, because a
hands-off approach floats about 40 m in ground effect over the deck.

## Dive brakes

Only the Dive Bomber has them (**X**). They are drag with no lift: zero-lift
drag rises by 0.16 when fully open (1.5 s travel), so the stall speed
doesn't change. In a vertical dive, drag balances weight near 450 km/h with
them out; without them the aircraft keeps accelerating far past that. A
steady, slow dive is what makes aiming a bomb possible (bombs arrive later
in Phase 4).

## Mapping to the brief's force list

| Brief | Where |
|---|---|
| Thrust | `availableThrust()` in `aerodynamics.ts` |
| Lift (airspeed and angle of attack) | `liftCoefficient()` and the lift force in `FlightModel.ts` |
| Gravity | `FlightModel.ts` (world −Y) |
| Drag | `dragCoefficient()` |
| Angular control forces | elevator, rudder and aileron authority terms in `FlightModel.ts` |
| Air resistance | drag, plus aerodynamic angular damping |

## Deliberate simplifications

No wind or turbulence (so no wind over a carrier's deck; the catapult makes
up for it). No propeller torque or P-factor, so it doesn't swing on
take-off. No gyroscopic coupling between axes, no spins (a stall doesn't
auto-rotate), and no fuel burn. Each is listed in KNOWN_ISSUES.md and can be
added if gameplay wants it.
