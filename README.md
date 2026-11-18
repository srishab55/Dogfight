# Dogfight Squadron

A browser-based 3D multiplayer aerial combat game: Red vs Blue team base
assault with dogfighting, bombing and territory capture. Inspired by Dogfight
Squadron, rebuilt in full 3D.

**Status:** A timed match, you against a squadron of four Red AI pilots,
over a small stretch of sea with three islands and two aircraft carriers.
Each side starts with its carrier; the three island airfields belong to
nobody. Take them, hold them, and take Red's: when the clock runs out, the
side holding more bases wins. Seven aircraft types, guns with limited
ammunition, anti-aircraft guns that shoot back, auto-land, and sound
synthesised in the browser. Phase 4 (combat) is in progress. See
[docs/PROGRESS.md](docs/PROGRESS.md), and fly the [full flight test](docs/FLIGHT_TEST.md).

**The map** is point-symmetric, so neither side is favoured: Blue's carrier
in the south-west, Red's in the north-east, the south, central and north
islands between them, each with an airfield (60 m runway, and a service lane
beside it to pull off onto for rearming). Neighbouring bases are 2.5–4 km
apart; carrier to carrier is 5.6 km.

**The match** (5, 10 or 15 minutes, chosen in the hangar):

- A field nobody holds is **taken by landing and stopping on it for 5 seconds**. Its two AA guns are then built for you in 30 seconds, and you can start and rearm there.
- A field the other side holds is defended: destroy its two AA guns, hangar, fuel depot and radar, then land on it to take it. A **carrier is taken the same way** (shoot its two AA guns, land on the deck with the hook, stop).
- **When time is up, the side holding more bases wins**; the same number is a draw. A side left with **no base at all** has nowhere to start from and **loses at once**.
- Your **aircraft is fixed for the match** (the base you start from can change). Exit to the main menu and everything resets.
- **Red's four AI pilots** launch from their carrier: two hunt you, two take bases. They land to capture fields, strafe defences, go home to rearm, and break when you get on their tail. **Come within 3 km of a Red base and all of them come to defend it.** One shot down is back **5 seconds** later, from the Red base nearest you.

| Aircraft (key) | Notes |
|---|---|
| Interceptor (1) | Fastest, best climb; light armour |
| Fighter-Bomber (2) | All-rounder |
| Heavy Bomber (3) | Four engines, 24 m wing; too big for a carrier deck: launched into the air over the carrier until your side holds an airfield |
| Naval Fighter (4) | Short take-off, slow approach, strong gear |
| Dive Bomber (5) | Dive brakes (X), two-seat |
| Triplane (6) / Biplane (7) | Old-school, slow and nimble |

| | |
|---|---|
| Rendering | [Babylon.js](https://www.babylonjs.com/) 9 (WebGL2) |
| Language / build | TypeScript 7 (strict), Vite 8 |
| Flight physics | Custom aerodynamic model in TypeScript, shared by client and (future) server ([how it works](docs/FLIGHT_MODEL.md)) |
| Tests | Vitest 4 |
| Collision | Rapier3D (Phase 4) |
| Multiplayer | Node.js + Colyseus, server-authoritative (Phase 5) |
| Persistence | PostgreSQL (Phase 8) |

Everything is free and open source. No paid services are required.

## Requirements

- macOS, Linux or Windows
- **Node.js 22.12 or newer** (includes npm)
- Git
- A desktop browser with WebGL 2 (current Chrome, Firefox, Safari or Edge)

## Quick start

```bash
npm install        # once, from the repository root
npm run dev        # start the dev server
```

Open <http://localhost:5173>. Saving any file reloads the page.

## Scripts (run from the repository root)

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with live reload on port 5173 |
| `npm run typecheck` | Strict type-check of `shared/` and `client/` |
| `npm test` | Flight-model test suite, including the automated full flight test (under 1 s) |
| `npm run build` | Type-check, then production build into `client/dist/` |
| `npm run preview` | Serve the production build on port 4173 |

Run only **one** dev server at a time: two share Vite's dependency cache and
can break each other (fix: stop both, run `npm run dev` again).

## Menus

The game opens at the **main menu**, over your aircraft parked at its base.
Your callsign is top right (click to change it). **PLAY** opens the hangar;
**Multiplayer** shows the lobby (online play needs the game server: Phase 5);
**Settings** and **Controls** open the settings. Every screen works with the
mouse, the keyboard (Tab, arrows, Enter, Esc to go back) or a gamepad (D-pad
or left stick to move, **A** to press, **B** to go back, **LB / RB** to change
tab), and every screen pauses the game.

**The hangar** (aircraft selection) is where you set up a flight, so the
flight keys stay few:

- **Aircraft**: the seven types (shortcuts **1 – 7**), each with its class and what it's for. Bars compare it with the rest of the fleet (speed, climb, turn rate, armour, firepower, bombs) beside the exact figures, and its loadout. Your aircraft is on show between the panels, the camera slowly circling it (drag to look round).
- **Paint**: ten schemes, remembered for each type; your team colour stays on the markings.
- **Deploy**: a map of your bases, captured ones too (click one, or **← →**). Every type but the Heavy Bomber can start on a carrier's catapult.
- **Start**: on the runway, in the air (800 m), or on final for landing practice.
- **Match**: 5, 10 or 15 minutes (before the match only).
- **FLY** (**Enter**) starts the match. From then on the aircraft cards are locked.

**Esc in flight pauses**: Resume, Change base (the hangar: FLY starts a new
flight from the chosen base, Back returns to the paused one), Settings,
Controls, Audio, Return to lobby (Phase 5) and **Exit to main menu**, which
abandons the match. When the match ends, or you exit, the **after-action
report** shows Victory, Defeat or Draw, the bases each side held, and your
figures: aircraft shot down, deaths, bases captured, damage dealt, hit
accuracy, sorties and flying time, ground targets by type. Continue resets
everything.

**After a crash** the HUD says what happened; **Enter** flies again at once
with the same choices. Otherwise the **respawn screen** opens after 1.5 s
(**Esc** opens it sooner): the hangar, with the cause and your last
sortie's figures.

**Settings** apply as you change them and are remembered in this browser:

- **Graphics**: a Low / Medium / High preset, or set render resolution (50–100 %), antialiasing (off, 2×, 4×), shadows (off, 1024, 2048) and bloom yourself.
- **Audio**: sound on or off, master volume.
- **Controls**: steering (easy turns or direct roll), mouse aim sensitivity, camera drag speed, every flight key rebindable (click Change, press the key; Esc and Enter stay fixed), invert gamepad pitch, and the gamepad layout.
- **Gameplay**: target markers, base labels and beacons, auto-land offers.
- **Accessibility**: text size in the menus (standard, large, larger), HUD scale (capped so it always fits the window), reduced motion (follows your system unless you choose; also stops the freeze on a kill), flashing effects (the red flash when you're hit, the white flash on what you hit), camera shake strength (0–100 %).

In flight (the default keys):

| Key | Action |
|---|---|
| **W / S** | Pitch up / down |
| **A / D** | Turn left / right: the aircraft banks into the turn and levels itself when you let go (direct roll can be chosen in Settings) |
| **Q / E** | Rudder left / right (steers the nose wheel on the ground) |
| **↑ / ↓** | Throttle up / down |
| **B** | Brakes (hold): wheel brakes on the ground, air brakes in the air. Braking closes the throttle to idle; it stays there when you let go (↑ to go again) |
| **F / V** | Flaps down / up a notch (UP → TAKE-OFF → LANDING) |
| **Space** | Fire guns (hold; they overheat after ~8 s, and ammunition is limited). Against aircraft, a red dot leads the nearest enemy ahead (put the gunsight on it), the gunsight turns **red** when firing now would hit, and rounds passing within 3 m of an enemy aircraft count as hits |
| **X** | Lock the Dive Bomber's dive brakes out / in |
| **C** | Camera: chase → cockpit → orbit |
| **P** | Auto-land at the base you're heading for (near and ahead, preferring yours and ones you can take; anyone's; every type but the Heavy Bomber can land on a carrier). It takes the shortest way in, comes down steeply with air brakes, and climbs over any hill on its path; about a minute from 4 km out. The HUD offers it within 5 km. **P** or any flight key takes over |
| **N** | Map: corner → big → off (remembered) |
| **Esc** | Pause menu |
| **Mouse** | Click the view to fly with the mouse: the aircraft flies towards the aim circle. **Esc** lets go of the mouse and pauses |
| Mouse drag / wheel | Look round / zoom (orbit camera and the hangar) |
| **`** | Debug stats (shown by default in dev) |

**With a gamepad** (any pad in the browser's standard layout; Xbox names): left
stick pitch and roll (pull back to climb; invert in Settings; in Easy
steering it turns), right stick sideways the rudder, **RT / LT** throttle up /
down, **A** fire (after a crash, fly again), **B** brakes, **X** dive brakes,
**Y** camera, **LB / RB** rudder, **D-pad ↑ / ↓** flaps, **D-pad →**
auto-land, **View** map, **Menu** pause. The keys and mouse keep working
alongside it.

**Bigger targets:** an enemy aircraft far enough off to look tiny is drawn
larger, never narrower than 4.5° of the view, up to 3× its real size (a
fighter at 300 m is drawn about twice as big, at 500 m three times); within
about 135 m, and on the ground, it is its real size. Your rounds hit the
size you see (the AI's rounds don't get this). Everything at a base (AA
guns, hangars, fuel depots, radars) is built 1.6× larger than life, hit
areas included.

**What you feel:** hits on an enemy flash its paint white and count up as a
number over its bracket ("−24"); the gunsight pops on each burst that
connects. Your kill punches the camera, freezes the world for a moment
(0.07 s), and a white cross marks where it's going down. Being hit, nearby
explosions, catapult launches and firm touchdowns shake the view by how big
they are and how close. Enemy aircraft off the screen or behind you show as
red arrows round the edge with their distance. All of it follows the
Accessibility settings.

Keys ramp the control surfaces smoothly: tap for small corrections, hold for
full deflection. In mouse flight, holding any flight key overrides the mouse
on that axis. The landing gear is automatic: it comes up soon after take-off and
down as you come in to land (the HUD's GEAR line shows it); touching down with it up
is a belly landing. Bombs arrive later in Phase 4 (on a key other than B). The default
bindings live in [client/src/config/controls.ts](client/src/config/controls.ts); players
rebind them in Settings → Controls.

Watch the airframe: ailerons, elevators, rudder and flaps all move with your inputs.

**Carrier tips:** on the catapult, push the throttle to full (**↑**) and the
catapult throws you off the bow with take-off flaps set. To land back on,
press **P** (auto-land), start on Landing in the hangar, or fly the approach
yourself: landing flaps lower the hook,
and the **LSO** line under the map at the top calls your approach (distance, high or
low, come left or right, then CUT). Touch down anywhere in the first half of
the deck and the hook stops you in about 50 m; miss every wire and the crash
barrier stops you (with some damage). Throttle to idle to be released.

**Finding the bases:** a column of light rises from every base in its
owner's colour (blue, red, white for nobody's; blinking amber when an enemy
base is defenceless), visible across the whole map, with the base's name and
distance on the HUD. The map (**N**) shows the islands, runways and
carriers, every base in its owner's colour, you, and every other aircraft
(small arrows in their team's colour). The Status panel (top left) shows the
time left, the bases each side holds, your kills, and the objective: the
nearest base you don't hold.

**Taking and attacking bases:** every island airfield has two big AA guns on
flak platforms (empty until somebody takes the field), a hangar, a fuel
depot and a radar beside the runway; each carrier has two AA guns. They
reach 2.4 km and take about 70 hits each. Red brackets mark enemy targets, and
bigger ones mark Red aircraft with their type and distance. What you destroy
stays destroyed. Destroy a Red field's AA guns, hangar, fuel depot and radar
and it's defenceless: land, stop for 5 seconds, and it's yours. (The radar
stands just off the runway near its far end: landing towards it, a touch of
rudder and you can shoot it from the ground, then just stay stopped.) Its
flag turns blue, you can rearm and start there, and 30 seconds later your
crews have built its defences: its AA guns now defend it for you. When you
dive at the ground, an orange circle shows where your rounds will hit; in
mouse flight, the aim circle is where they land.

**Ammunition:** the AMMO readout counts your rounds. When they run out, fly
to a friendly base (the HOME BASE readout gives distance and bearing), land,
stop and idle: the ground crew rearms and repairs you in 6 seconds. On an
airfield, pull off the runway onto the service lane (the yellow-lined strip
beside it, with white parking boxes) to keep the runway clear.

**Landing tip:** choose Start: Landing in the hangar, then let go. With landing flaps and the briefed
throttle, the aircraft flies the glide slope by itself; idle the throttle just
before touchdown. Keep the PAPI lights (left of the runway) at 2 red, 2 white,
and the flight-path marker (circle with wings) on the touchdown zone.

## Deploying

The game client is a static site: `npm run build` writes plain HTML, JS and
assets to `client/dist/`, and any static web host can serve them.

**Vercel (free Hobby plan).** [vercel.json](vercel.json) tells Vercel how to
build this monorepo: `npm ci`, then `npm run build`, serving `client/dist`.
It also lets browsers cache the content-hashed files in `assets/` for a year.
Import the GitHub repository at <https://vercel.com/new>, leave every setting
at its default, and Deploy. After that, every push to `main` redeploys and
every other branch gets its own preview URL.

Hobby plan limits: non-commercial use only, and about 100 GB of transfer a
month. It also can't host the Phase 5 multiplayer server, which needs a
process that stays running with open WebSocket connections.

**Self-hosted alternative.** Copy `client/dist/` to any machine running a
static web server, such as Caddy (`caddy file-server --root client/dist`) or
nginx. GitHub Pages and Cloudflare Pages are also free. From Phase 5, the
game server runs as a Node process on any always-on machine (a small VPS or
home server), next to or separate from the static client.

## Project layout

```
shared/   Engine-agnostic code for browser AND server: config, maths, flight model, tests
client/   Browser game: Babylon.js rendering, input, cameras, UI, audio
server/   (Phase 5) Colyseus game server, authoritative simulation, AI
docs/     Architecture, progress checklist, known issues
```

Tunable numbers live in `config/` folders, never inline:
[shared/src/config](shared/src/config) holds gameplay values the server also
needs; [client/src/config](client/src/config) holds visual and input settings.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): system design, conventions, decision log
- [docs/FLIGHT_MODEL.md](docs/FLIGHT_MODEL.md): how the aircraft fly (lift, drag, stall, handling, ground contact)
- [docs/FLIGHT_TEST.md](docs/FLIGHT_TEST.md): the full flight test, card by card
- [docs/PROGRESS.md](docs/PROGRESS.md): roadmap checklist
- [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md): bugs, limitations, risks

## Debugging tips

- In dev builds the running game is available in the DevTools console as `window.dogfight`.
- The debug overlay shows FPS, CPU render time and draw calls. Check it after every feature.
- Chrome DevTools → Performance → Record gives a per-frame breakdown when FPS drops.
