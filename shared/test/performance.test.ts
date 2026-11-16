import { describe, expect, it } from 'vitest';
import { AIRCRAFT_CLASSES, AIRCRAFT_CLASS_IDS, computePerformance } from '../src/index';

const perf = Object.fromEntries(AIRCRAFT_CLASS_IDS.map((id) => [id, computePerformance(AIRCRAFT_CLASSES[id])])) as Record<
  (typeof AIRCRAFT_CLASS_IDS)[number],
  ReturnType<typeof computePerformance>
>;

describe('aircraft classes match their brief', () => {
  it('prints the derived performance table (copied into docs/FLIGHT_MODEL.md)', () => {
    const rows = AIRCRAFT_CLASS_IDS.map((id) => {
      const p = perf[id];
      return `| ${AIRCRAFT_CLASSES[id].displayName} | ${(p.stallSpeed * 3.6).toFixed(0)} | ${(p.topSpeed * 3.6).toFixed(0)} | ${p.bestClimbRate.toFixed(1)} | ${p.maxTurnRateDeg.toFixed(1)} | ${(p.cornerSpeed * 3.6).toFixed(0)} | ${p.thrustToWeight.toFixed(2)} | ${p.wingLoading.toFixed(0)} |`;
    });
    console.log(['| Class | Stall km/h | Top km/h | Climb m/s | Max turn deg/s | Corner km/h | T/W | Wing loading Pa |', ...rows].join('\n'));
  });

  it('every class has a realistic propeller-era envelope', () => {
    for (const id of AIRCRAFT_CLASS_IDS) {
      const p = perf[id];
      expect(p.stallSpeed).toBeGreaterThan(35); // 126 km/h
      expect(p.stallSpeed).toBeLessThan(60); // 216 km/h
      expect(p.topSpeed).toBeGreaterThan(110); // 396 km/h
      expect(p.topSpeed).toBeLessThan(200); // 720 km/h
      expect(p.bestClimbRate).toBeGreaterThan(5);
    }
  });

  it('Interceptor: highest top speed, acceleration, climb and turn rate; lightest; least armour', () => {
    const { interceptor: i, fighterBomber: f, heavyBomber: h } = perf;
    expect(i.topSpeed).toBeGreaterThan(f.topSpeed);
    expect(i.thrustToWeight).toBeGreaterThan(f.thrustToWeight);
    expect(i.bestClimbRate).toBeGreaterThan(f.bestClimbRate);
    expect(i.maxTurnRateDeg).toBeGreaterThan(f.maxTurnRateDeg);
    expect(f.maxTurnRateDeg).toBeGreaterThan(h.maxTurnRateDeg);
    const spec = AIRCRAFT_CLASSES;
    expect(spec.interceptor.mass).toBeLessThan(spec.fighterBomber.mass);
    expect(spec.interceptor.combat.maxHullHealth).toBeLessThan(spec.fighterBomber.combat.maxHullHealth);
    expect(spec.interceptor.combat.bombCapacity).toBe(0);
  });

  it('Fighter-Bomber: balanced, three bombs. Heavy Bomber: slowest, heaviest armour, eight bombs, two guns', () => {
    const spec = AIRCRAFT_CLASSES;
    expect(perf.fighterBomber.topSpeed).toBeGreaterThan(perf.heavyBomber.topSpeed);
    expect(perf.heavyBomber.thrustToWeight).toBeLessThan(perf.fighterBomber.thrustToWeight);
    expect(spec.fighterBomber.combat.bombCapacity).toBe(3);
    expect(spec.heavyBomber.combat.bombCapacity).toBe(8);
    expect(spec.heavyBomber.combat.gunCount).toBe(2);
    expect(spec.heavyBomber.combat.maxHullHealth).toBeGreaterThan(spec.fighterBomber.combat.maxHullHealth);
    expect(spec.heavyBomber.handling.roll.maxRateDeg).toBeLessThan(spec.fighterBomber.handling.roll.maxRateDeg);
  });
});
