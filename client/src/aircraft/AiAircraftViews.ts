import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AIRFRAMES, CARRIERS, cloneAircraftState, copyAircraftState, type AiPilot, type AircraftState } from '@dogfight/shared';
import { FLAP_STYLE_BY_CLASS, TEAM_PAINT } from '../config/aircraftVisuals';
import { BURN_CONFIG } from '../config/combatVisuals';
import type { FireAndSmoke } from '../effects/FireAndSmoke';
import type { AircraftVisual } from './AircraftVisual';
import { createAircraftModel } from './aircraftModel';

interface View {
  pilot: AiPilot;
  readonly visual: AircraftVisual;
  /** The state before the last physics step, for smooth motion between steps. */
  readonly previous: AircraftState;
  /** Which state object `previous` belongs to: a new one means a fresh aircraft (snap, don't glide). */
  stateRef: AircraftState | null;
  wasCrashed: boolean;
  smokeCarry: number;
}

/** A hook goes down within this distance of a carrier with landing flaps out, as on the player's aircraft. */
const HOOK_NEAR_CARRIER = 3_000;

/**
 * The AI pilots' aircraft as you see them: one model each, in their team's
 * paint, posed between physics steps the way the player's is, with control
 * surfaces, gear, flaps and propeller; smoke when damaged, fire when shot
 * down, an explosion where they come down. Shows only what the shared AI
 * and flight model decide.
 */
export class AiAircraftViews {
  private views: View[] = [];
  private readonly position = new Vector3();
  private readonly orientation = new Quaternion();
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly fromQ = new Quaternion();
  private readonly toQ = new Quaternion();

  constructor(
    private readonly scene: Scene,
    private readonly fireAndSmoke: FireAndSmoke,
    /** New models' meshes, for the shadow generator. */
    private readonly addShadowCasters: (meshes: readonly Mesh[]) => void,
    /** An AI aircraft hit the ground or sea (for the explosion sound). */
    private readonly onCrash: (x: number, y: number, z: number) => void,
  ) {}

  /** The squadron to show (a new match brings new pilots; the models are kept when the types match). */
  setPilots(pilots: readonly AiPilot[]): void {
    const kept: View[] = [];
    pilots.forEach((pilot, i) => {
      const old = this.views[i];
      if (old && old.pilot.spec.airframe.id === pilot.spec.airframe.id && old.pilot.team === pilot.team) {
        old.pilot = pilot;
        old.stateRef = null;
        old.wasCrashed = false;
        kept.push(old);
        return;
      }
      old?.visual.dispose();
      const visual = createAircraftModel(this.scene, AIRFRAMES[pilot.spec.airframe.id], pilot.team, `ai-${pilot.id}`, TEAM_PAINT[pilot.team].body);
      visual.setScale(pilot.spec.airframeScale);
      visual.setFlapStyle(FLAP_STYLE_BY_CLASS[pilot.spec.id]);
      visual.setEnabled(false);
      this.addShadowCasters(visual.meshes);
      kept.push({ pilot, visual, previous: cloneAircraftState(pilot.state), stateRef: null, wasCrashed: false, smokeCarry: 0 });
    });
    for (const extra of this.views.slice(pilots.length)) extra.visual.dispose();
    this.views = kept;
  }

  /** Inside each physics step, just before the AI fly: remember where each aircraft was. */
  beforeStep(): void {
    for (const view of this.views) {
      copyAircraftState(view.previous, view.pilot.state);
      view.stateRef = view.pilot.state;
    }
  }

  /** Once a frame, after the physics: pose the models between the last two steps, and their smoke and fire. */
  update(alpha: number, deltaSeconds: number): void {
    for (const view of this.views) {
      const { pilot, visual } = view;
      const state = pilot.state;
      const shown = pilot.spawned && !state.crashed;
      if (state.crashed && !view.wasCrashed && view.stateRef === state) {
        const p = state.position;
        this.fireAndSmoke.explosion(p.x, p.y, p.z, 2.5);
        this.onCrash(p.x, p.y, p.z);
      }
      view.wasCrashed = state.crashed;
      visual.setEnabled(shown);
      if (!shown) continue;
      // A fresh aircraft (launched, or towed back to the runway): no gliding from where the last one was.
      const a = view.stateRef === state ? view.previous : state;
      this.from.set(a.position.x, a.position.y, a.position.z);
      this.to.set(state.position.x, state.position.y, state.position.z);
      Vector3.LerpToRef(this.from, this.to, alpha, this.position);
      this.fromQ.set(a.orientation.x, a.orientation.y, a.orientation.z, a.orientation.w);
      this.toQ.set(state.orientation.x, state.orientation.y, state.orientation.z, state.orientation.w);
      Quaternion.SlerpToRef(this.fromQ, this.toQ, alpha, this.orientation);
      visual.setPose(this.position, this.orientation);
      visual.setFlapDeflection(state.flapPosition);
      visual.setAirbrake(state.airbrakePosition);
      visual.setGear(state.gearPosition);
      const nearCarrier = CARRIERS.some((c) => Math.hypot(c.center.x - state.position.x, c.center.z - state.position.z) < HOOK_NEAR_CARRIER);
      visual.setTailhook(state.hookEngaged || (state.flapPosition > 0.75 && nearCarrier) ? 1 : 0);
      visual.updateControlSurfaces(deltaSeconds, pilot.controls.pitch, pilot.controls.roll, pilot.controls.yaw);
      visual.updatePropeller(deltaSeconds, Math.max(state.throttle, Math.min(0.6, state.telemetry.airspeed / 160)));
      this.smoke(view, deltaSeconds);
    }
  }

  dispose(): void {
    for (const view of this.views) view.visual.dispose();
    this.views = [];
  }

  /** Grey smoke when damaged, black with flames when badly hit or going down. */
  private smoke(view: View, deltaSeconds: number): void {
    const state = view.pilot.state;
    const hull = state.hullHealth / view.pilot.spec.combat.maxHullHealth;
    if (!state.shotDown && hull >= BURN_CONFIG.aircraftSmokeBelow) return;
    const burning = state.shotDown || hull < BURN_CONFIG.aircraftFireBelow;
    view.smokeCarry += BURN_CONFIG.aircraftSmokePerSecond * deltaSeconds;
    const p = this.position;
    while (view.smokeCarry >= 1) {
      view.smokeCarry -= 1;
      this.fireAndSmoke.smokePuff(p.x, p.y, p.z, burning ? 1 : 0.15, 0.6, 4);
      if (burning) this.fireAndSmoke.flame(p.x, p.y, p.z, 0.6);
    }
  }
}
