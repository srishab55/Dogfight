import { describe, expect, it } from 'vitest';
import { integrateBodyAngularVelocity, inverseRotateVec3, multiplyQuat, quatFromAxisAngle, quatFromHeading, quatIdentity, rotateVec3 } from '../src/math/quat';
import { crossVec3, vec3 } from '../src/math/vec3';
import { getAttitude } from '../src/index';

/*
 * These pin our maths conventions to Babylon.js's. The expected values were
 * produced by Babylon's own Quaternion in Phase 0 (see ARCHITECTURE.md §8).
 * If they ever change, the renderer and the physics would disagree about
 * which way the aircraft points.
 */

const close = (actual: { x: number; y: number; z: number }, expected: [number, number, number]) => {
  expect(actual.x).toBeCloseTo(expected[0], 6);
  expect(actual.y).toBeCloseTo(expected[1], 6);
  expect(actual.z).toBeCloseTo(expected[2], 6);
};

describe('axis conventions (must match Babylon.js)', () => {
  it('cross(up, forward) is right in our left-handed axes', () => {
    close(crossVec3(vec3(), vec3(0, 1, 0), vec3(0, 0, 1)), [1, 0, 0]);
  });

  it('positive rotation about +Y turns the nose (+Z) towards +X (yaw right)', () => {
    const q = quatFromAxisAngle(quatIdentity(), vec3(0, 1, 0), Math.PI / 2);
    close(rotateVec3(vec3(), q, vec3(0, 0, 1)), [1, 0, 0]);
  });

  it('positive rotation about +X pitches the nose down', () => {
    const q = quatFromAxisAngle(quatIdentity(), vec3(1, 0, 0), Math.PI / 2);
    close(rotateVec3(vec3(), q, vec3(0, 0, 1)), [0, -1, 0]);
  });

  it('positive rotation about +Z lifts the right wing (roll left)', () => {
    const q = quatFromAxisAngle(quatIdentity(), vec3(0, 0, 1), Math.PI / 2);
    close(rotateVec3(vec3(), q, vec3(1, 0, 0)), [0, 1, 0]);
  });

  it('heading 90 degrees faces east (+X)', () => {
    close(rotateVec3(vec3(), quatFromHeading(quatIdentity(), Math.PI / 2), vec3(0, 0, 1)), [1, 0, 0]);
  });
});

describe('quaternion operations', () => {
  it('inverse rotation undoes rotation', () => {
    const q = quatFromAxisAngle(quatIdentity(), { x: 0.6, y: 0.8, z: 0 }, 1.234);
    const v = vec3(3, -2, 5);
    close(inverseRotateVec3(vec3(), q, rotateVec3(vec3(), q, v)), [3, -2, 5]);
  });

  it('multiply applies the right-hand rotation first', () => {
    const yaw = quatFromAxisAngle(quatIdentity(), vec3(0, 1, 0), Math.PI / 2);
    const pitchDown = quatFromAxisAngle(quatIdentity(), vec3(1, 0, 0), Math.PI / 2);
    // Pitch the nose down first (to -Y), then yaw: the nose stays pointing down.
    close(rotateVec3(vec3(), multiplyQuat(quatIdentity(), yaw, pitchDown), vec3(0, 0, 1)), [0, -1, 0]);
  });

  it('integrating a body yaw rate for 1 s turns 1 rad about the aircraft own up axis', () => {
    // Start banked 90 degrees right: the aircraft's up axis now points along world +X.
    // A body-axis yaw must then swing the nose vertically in world terms, not change heading.
    const banked = quatFromAxisAngle(quatIdentity(), vec3(0, 0, 1), -Math.PI / 2);
    for (let i = 0; i < 60; i++) integrateBodyAngularVelocity(banked, vec3(0, 1, 0), 1 / 60);
    const nose = rotateVec3(vec3(), banked, vec3(0, 0, 1));
    expect(nose.x).toBeCloseTo(0, 6);
    expect(Math.atan2(-nose.y, nose.z)).toBeCloseTo(1, 4);
  });
});

describe('attitude read-out', () => {
  it('reads heading, pitch and bank in pilot terms', () => {
    const level = getAttitude(quatFromHeading(quatIdentity(), Math.PI / 2));
    expect(level.headingDeg).toBeCloseTo(90, 6);
    expect(level.pitchDeg).toBeCloseTo(0, 6);
    expect(level.bankDeg).toBeCloseTo(0, 6);

    const noseUp = getAttitude(quatFromAxisAngle(quatIdentity(), vec3(1, 0, 0), -0.5));
    expect(noseUp.pitchDeg).toBeCloseTo((0.5 * 180) / Math.PI, 4);

    const bankedRight = getAttitude(quatFromAxisAngle(quatIdentity(), vec3(0, 0, 1), -Math.PI / 6));
    expect(bankedRight.bankDeg).toBeCloseTo(30, 4);
  });
});
