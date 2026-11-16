import { describe, expect, it } from 'vitest';
import { AIRCRAFT_CLASSES } from '../src/index';
import { availableThrust, liftCoefficient, maxLiftCoefficient, stallAngles, updateFlowSeparation } from '../src/flight/aerodynamics';

const aero = AIRCRAFT_CLASSES.fighterBomber.aero;
const DEG = Math.PI / 180;

describe('lift curve', () => {
  it('rises linearly with angle of attack while the flow is attached', () => {
    const at0 = liftCoefficient(0, 0, aero);
    const at5 = liftCoefficient(5 * DEG, 0, aero);
    const at10 = liftCoefficient(10 * DEG, 0, aero);
    expect(at0).toBeCloseTo(aero.zeroAngleLiftCoefficient, 6);
    expect(at10 - at5).toBeCloseTo(at5 - at0, 6);
  });

  it('collapses when the flow separates past the critical angle', () => {
    const clMax = maxLiftCoefficient(aero);
    const stalled = liftCoefficient((aero.criticalAngleOfAttackDeg + 1) * DEG, 1, aero);
    expect(stalled).toBeLessThan(0.6 * clMax);
  });

  it('produces negative lift at negative angles (needed for inverted flight)', () => {
    expect(liftCoefficient(-10 * DEG, 0, aero)).toBeLessThan(-0.5);
  });
});

describe('stall onset and recovery (flow separation)', () => {
  const { positive } = stallAngles(aero);
  const settle = (start: number, alpha: number, seconds: number) => {
    let s = start;
    for (let i = 0; i < seconds * 60; i++) s = updateFlowSeparation(s, alpha, aero, 1 / 60, true);
    return s;
  };

  it('separates within a fraction of a second past the critical angle', () => {
    expect(settle(0, positive + 1 * DEG, 0.5)).toBeGreaterThan(0.95);
  });

  it('stays stalled just below the critical angle: recovery needs the nose lowered further (hysteresis)', () => {
    expect(settle(1, positive - 1 * DEG, 3)).toBe(1);
  });

  it('re-attaches once the angle of attack is reduced below the hysteresis band', () => {
    expect(settle(1, positive - (aero.stallHysteresisDeg + 1) * DEG, 3)).toBeLessThan(0.01);
  });

  it('never stalls when there is no meaningful airflow (parked)', () => {
    let s = 1;
    for (let i = 0; i < 180; i++) s = updateFlowSeparation(s, 40 * DEG, aero, 1 / 60, false);
    expect(s).toBeLessThan(0.01);
  });
});

describe('propeller thrust', () => {
  const engine = AIRCRAFT_CLASSES.interceptor.engine;
  it('is capped at static thrust when slow and falls off as power / speed when fast', () => {
    expect(availableThrust(engine, 0, 1)).toBe(engine.staticThrust);
    const at100 = availableThrust(engine, 100, 1);
    const at150 = availableThrust(engine, 150, 1);
    expect(at100 / at150).toBeCloseTo(1.5, 6);
  });

  it('falls with air density at altitude', () => {
    expect(availableThrust(engine, 100, 0.5)).toBeCloseTo(availableThrust(engine, 100, 1) / 2, 6);
  });
});
