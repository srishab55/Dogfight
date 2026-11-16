# Dogfight

A browser-based 3D multiplayer aerial combat game: Red vs Blue team base
assault with dogfighting, bombing and territory capture. Inspired by Dogfight
Squadron, rebuilt in full 3D.

**Status:** Phases 1–2 complete: take off, fly, stall, recover and land three
aircraft classes, with flaps and landing aids. Phase 4 has started: guns,
tracers and practice targets. See [docs/PROGRESS.md](docs/PROGRESS.md), and
fly the [full flight test](docs/FLIGHT_TEST.md).

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
| **A / D** | Roll left / right |
| **Q / E** | Rudder left / right (steers the nose wheel on the ground) |
| **↑ / ↓** | Throttle up / down. At idle, the wheel brakes are applied. |
| **F / V** | Flaps down / up a notch (UP → TAKE-OFF → LANDING) |
| **Space** | Fire guns (hold; they overheat after ~8 s) |
| **Mouse** | Click the view to fly with the mouse: the aircraft flies towards the aim circle. **Esc** releases. |
| **C** | Camera: chase → cockpit → orbit |
| **R** | Respawn on the runway |
| **T** | Air start at 800 m (for testing manoeuvres) |
| **L** | Landing practice: on a 3° final approach with flaps down |
| **1 / 2 / 3** | Interceptor / Fighter-Bomber / Heavy Bomber |
| **[ / ]** | Mouse sensitivity down / up (remembered) |
| **H** | Hide / show the controls list |
| **`** | Debug stats (shown by default in dev) |
| Mouse drag / wheel | Rotate / zoom (orbit camera) |

Keys ramp the control surfaces smoothly: tap for small corrections, hold for
full deflection. In mouse flight, holding any flight key overrides the mouse
on that axis. Bombs (B) arrive later in Phase 4. Bindings and mouse
sensitivity live in [client/src/config/controls.ts](client/src/config/controls.ts).

Watch the airframe: ailerons, elevators, rudder and flaps all move with your inputs.

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
