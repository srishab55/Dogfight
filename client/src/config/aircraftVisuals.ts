import type { AircraftClassId, Team } from '@dogfight/shared';

/**
 * Paint schemes per team. The body is a muted team tint; the accent (spinner,
 * tail fin, wingtips, fuselage band, roundel centre) is saturated so the team
 * is readable at a distance.
 */
export const TEAM_PAINT: Readonly<Record<Team, { body: string; accent: string }>> = {
  blue: { body: '#5d7087', accent: '#2c7be5' },
  red: { body: '#80605a', accent: '#d63a2f' },
};

export const AIRCRAFT_MATERIAL_CONFIG = {
  paintRoughness: 0.45,
  canopyColor: '#1b2733',
  canopyRoughness: 0.08,
  /** Landing gear, exhausts and propeller blades. */
  darkMetalColor: '#26282b',
  darkMetalRoughness: 0.55,
} as const;

/**
 * Team roundels painted on the upper and lower wing surfaces. Their size and
 * position are part of each airframe's design (shared airframe.ts).
 */
export const ROUNDEL_CONFIG = {
  /** Rings from the outside in: dark rim, white ring, team colour centre. */
  rimColor: '#1f2a35',
  ringColor: '#f2f2ec',
} as const;

/**
 * Propeller look. The prop spins up with the engine, so it is still at a cold
 * start. Real propellers turn ~25 times a second, far too fast for a 60 Hz
 * screen: drawn as solid blades they would strobe and appear to stop or run
 * backwards. So, like real footage, the blades fade into a translucent blur
 * disc as RPM rises.
 */
export const PROPELLER_VISUAL_CONFIG = {
  /** Propeller speed at full power (rev/s). */
  maxRevsPerSecond: 25,
  /** Engine RPM as a fraction of full: the larger of the throttle and windmilling from airspeed. */
  windmillFractionAt100ms: 0.45,
  /** How quickly the prop's visual speed follows the engine (s); gives a visible spin-up. */
  spinUpTime: 1.2,
  /** Blades start fading into the disc at this rate (rev/s)... */
  blurStartRevsPerSecond: 3.5,
  /** ...and have disappeared by this rate. Below ~10 rev/s, 3 blades still read as turning forwards at 60 Hz. */
  blurEndRevsPerSecond: 8,
  /** Opacity of the fully formed blur disc. */
  discOpacity: 0.45,
} as const;

/**
 * How control surfaces are drawn. They follow the pilot's actual inputs
 * (keyboard, mouse pilot or later the AI), through a short actuator lag.
 */
export const CONTROL_SURFACE_VISUAL_CONFIG = {
  aileronMaxDeg: 18,
  elevatorMaxDeg: 22,
  rudderMaxDeg: 25,
  /** Dive-brake plates swing this far open (upper up, lower down). */
  diveBrakeMaxDeg: 60,
  /** Arrestor hook angle below the fuselage line: stowed (negative = tucked up) and lowered. */
  tailhookStowedDeg: -4,
  tailhookLoweredDeg: 50,
  /** How quickly surfaces follow the stick (1/s). Real surfaces lag slightly. */
  actuatorSharpness: 14,
} as const;

/**
 * Flap motion styles. Slotted flaps swing down about a hinge below the wing;
 * Fowler flaps (big bombers) also slide aft, adding wing area.
 */
export const FLAP_STYLES = {
  slotted: { maxDeflectionDeg: 42, aftTravel: 0.06 },
  fowler: { maxDeflectionDeg: 35, aftTravel: 0.38 },
} as const;

export const FLAP_STYLE_BY_CLASS: Readonly<Record<AircraftClassId, keyof typeof FLAP_STYLES>> = {
  interceptor: 'slotted',
  fighterBomber: 'slotted',
  heavyBomber: 'fowler',
  navalFighter: 'slotted',
  diveBomber: 'slotted',
};
