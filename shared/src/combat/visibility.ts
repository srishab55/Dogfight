import { groundClearance, type AircraftClassSpec } from '../config/aircraftClasses';
import { TARGET_VISIBILITY_CONFIG } from '../config/weapons';
import type { AircraftState } from '../flight/AircraftState';

/*
 * Target visibility (TARGET_VISIBILITY_CONFIG): how much larger an aircraft
 * is drawn, and hit by a human pilot's rounds, so that it never looks too
 * small to aim at. The client draws it with `shownScale`; the combat world
 * and the on-target cue use the same numbers, so what you see is what you hit.
 */

const TAN_MIN_APPARENT = Math.tan((TARGET_VISIBILITY_CONFIG.minApparentDeg * Math.PI) / 180);

/** Scale (1 to maxScale) that keeps an aircraft `span` metres across at least minApparentDeg wide from `distance` metres. */
export function visibilityScale(span: number, distance: number): number {
  if (span <= 0) return 1;
  return Math.max(1, Math.min(TARGET_VISIBILITY_CONFIG.maxScale, (distance * TAN_MIN_APPARENT) / span));
}

/** 0 on the ground (real size, so the wheels stay on the runway), rising to 1 by fullHeight above it. */
export function enlargeBlend(state: Readonly<AircraftState>, spec: AircraftClassSpec, groundHeight: number): number {
  if (state.onGround || state.crashed) return 0;
  const height = state.position.y - groundClearance(spec) - groundHeight;
  return Math.max(0, Math.min(1, height / TARGET_VISIBILITY_CONFIG.fullHeight));
}

/** The scale an aircraft is shown (and hit) at: `visibilityScale`, faded in by `blend` (see enlargeBlend). */
export function shownScale(span: number, distance: number, blend: number): number {
  return 1 + (visibilityScale(span, distance) - 1) * blend;
}
