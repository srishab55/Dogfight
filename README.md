# Dogfight Squadron

A browser-based 3D multiplayer aerial combat game: Red vs Blue team base
assault with dogfighting, bombing and territory capture. Inspired by Dogfight
Squadron, rebuilt in full 3D.

**Status:** Fly five aircraft types over a small stretch of sea with three
islands and two aircraft carriers. Take off from an island airfield, or get
catapulted off a carrier and land back on it with the arrestor hook. Attack
Red's island and carrier: their anti-aircraft guns shoot back, parked
aircraft burn, and the carrier can be sunk. Guns have limited ammunition:
land at a friendly base to rearm. All sound is synthesised in the browser. Phase 3 (graphics)
and Phase 4 (combat) are in progress. See [docs/PROGRESS.md](docs/PROGRESS.md),
and fly the [full flight test](docs/FLIGHT_TEST.md).

**The map:** Blue holds the southern island (airfield) and the carrier to its
west; Red the northern island and the carrier to its east. The central island,
with a 760 m mountain, lies between them.

| Aircraft (key) | Home | Notes |
|---|---|---|
| Interceptor (1) | Island airfield | Fastest, best climb; light armour |
| Fighter-Bomber (2) | Island airfield | All-rounder |
| Heavy Bomber (3) | Island airfield | Four engines, 24 m wing; slow, heavily armoured |
| Naval Fighter (4) | Carrier | Short take-off, slow approach, strong gear, tailhook |
| Dive Bomber (5) | Carrier | Dive brakes (X), two-seat, tailhook |

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

## Controls

| Key | Action |
|---|---|
| **W / S** | Pitch up / down |
| **A / D** | Turn left / right: the aircraft banks into the turn and levels itself when you let go (**K** switches to direct roll) |
| **Q / E** | Rudder left / right (steers the nose wheel on the ground) |
| **↑ / ↓** | Throttle up / down |
| **B** | Brakes (hold): wheel brakes on the ground, air brakes in the air |
| **F / V** | Flaps down / up a notch (UP → TAKE-OFF → LANDING) |
| **X** | Lock the Dive Bomber's dive brakes out / in |
| **Space** | Fire guns (hold; they overheat after ~8 s, and ammunition is limited) |
| **Mouse** | Click the view to fly with the mouse: the aircraft flies towards the aim circle. **Esc** releases. |
| **C** | Camera: chase → cockpit → orbit |
| **R** | Respawn at your base: the one you chose with **J**, at first your airfield (or the carrier's catapult) |
| **J** | Stopped on the ground, or crashed: a map of your bases, captured ones too. Click one (or **← →**), then click it again, **TAKE OFF HERE** or **Enter**. Every type but the Heavy Bomber can start on a carrier's catapult |
| **T** | Air start at 800 m (for testing manoeuvres) |
| **L** | Landing practice: on a 3° final approach with flaps down (carrier aircraft: to the carrier) |
| **P** | Auto-land at the nearest base within 10 km (any team; every type but the Heavy Bomber can land on a carrier). The HUD offers it within 5 km. **P** or any flight key takes over |
| **N** | Map: corner → big → off (remembered) |
| **1 – 7** | Interceptor / Fighter-Bomber / Heavy Bomber / Naval Fighter / Dive Bomber / Triplane / Biplane |
| **O** | Paint: the next colour scheme for the aircraft you're flying (remembered for each type; your team colour stays on the markings) |
| **[ / ]** | Mouse sensitivity down / up (remembered) |
| **K** | Steering: easy turns (default) / direct roll |
| **M** | Sound on / off (sound starts with your first key press or click) |
| **H** | Hide / show the controls list |
| **`** | Debug stats (shown by default in dev) |
| Mouse drag / wheel | Rotate / zoom (orbit camera) |

Keys ramp the control surfaces smoothly: tap for small corrections, hold for
full deflection. In mouse flight, holding any flight key overrides the mouse
on that axis. The landing gear is automatic: it comes up soon after take-off and
down as you come in to land (the HUD's GEAR line shows it); touching down with it up
is a belly landing. Bombs arrive later in Phase 4 (on a key other than B). Bindings and mouse
sensitivity live in [client/src/config/controls.ts](client/src/config/controls.ts).

Watch the airframe: ailerons, elevators, rudder and flaps all move with your inputs.

**Carrier tips:** on the catapult, push the throttle to full (**↑**) and the
catapult throws you off the bow with take-off flaps set. To land back on,
press **L** (or fly the approach yourself): landing flaps lower the hook,
and the **LSO** line under the title calls your approach (distance, high or
low, come left or right, then CUT). Touch down anywhere in the first half of
the deck and the hook stops you in about 50 m; miss every wire and the crash
barrier stops you (with some damage). Throttle to idle to be released.

**Finding the bases:** a column of light rises from every base in its
owner's colour (blue or red; blinking amber when an enemy base is
defenceless), visible across the whole map, with the base's name and
distance on the HUD. The map (**N**) shows the islands, runways and
carriers, every base in its owner's colour, and you.

**Attacking and capturing Red's airfield:** it's defended by one big AA gun
on a flak platform with a tall red flag, and has a hangar, a fuel depot and
a radar station beside the north end of the runway (plus parked aircraft).
Red brackets on the HUD mark them, and the status line under the title
counts the defences left. What you destroy stays destroyed. Destroy the AA
gun, hangar, fuel depot and radar and the base is defenceless: land, stop on
its runway for 5 seconds, and it's captured. (Landing heading north, the
radar is a few hundred metres ahead: a touch of rudder and you can shoot it
from the runway, then just stay stopped.) Its flag turns blue, you can
rearm there, and 30 seconds later your crews have repaired its defences:
its AA gun now defends it for you. When you dive at the ground, an orange circle
shows where your rounds will hit; in mouse flight, the aim circle is where
they land. The carrier has one big AA gun and can be sunk.

**Ammunition:** the AMMO readout counts your rounds. When they run out, fly
to a friendly base (the BASE readout gives distance and bearing), land, stop
and idle: the ground crew rearms and repairs you in 6 seconds.

**Landing tip:** press **L**, then let go. With landing flaps and the briefed
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
