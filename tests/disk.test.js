import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  circularEmitterShift,
  clampScene,
  emitTemperature,
  iscoRadius,
  observedEmission,
  staticGravitationalShift,
  keplerOmega,
  T_REF,
} from '../src/physics/disk.js';

describe('gravitational and circular shifts', () => {
  it('static shift is √(1 − 2M/r)', () => {
    const M = 1;
    const r = 8;
    const g = staticGravitationalShift(M, r);
    assert.ok(Math.abs(g - Math.sqrt(1 - 2 / r)) < 1e-15);
    assert.equal(staticGravitationalShift(M, 2), null);
  });

  it('face-on circular shift at ISCO is √(1/2)', () => {
    const M = 1;
    const r = iscoRadius(M);
    const g = circularEmitterShift(M, r, { dopplerEnabled: false });
    assert.ok(Math.abs(g - Math.SQRT1_2) < 1e-15);
  });

  it('longitudinal Doppler changes sign with λ', () => {
    const M = 1;
    const r = 10;
    const omega = keplerOmega(M, r);
    const lambda = 2;
    const gPlus = circularEmitterShift(M, r, {
      dopplerEnabled: true,
      lambdaY: lambda,
    });
    const gMinus = circularEmitterShift(M, r, {
      dopplerEnabled: true,
      lambdaY: -lambda,
    });
    const base = Math.sqrt(1 - 3 * M / r);
    assert.ok(Math.abs(gPlus - base / (1 - omega * lambda)) < 1e-12);
    assert.ok(Math.abs(gMinus - base / (1 + omega * lambda)) < 1e-12);
    assert.ok(gPlus > gMinus);
  });

  it('circular shift is undefined at or inside the photon sphere', () => {
    assert.equal(
      circularEmitterShift(1, 3, { dopplerEnabled: false }),
      null
    );
    assert.equal(
      circularEmitterShift(1, 2.9, { dopplerEnabled: false }),
      null
    );
  });
});

describe('emission model', () => {
  it('applies a single (g T / T_ref)⁴ bolometric weight', () => {
    const g = Math.SQRT1_2;
    const TEmit = emitTemperature(9, 6);
    assert.ok(TEmit > 0);
    const { TObs, weight } = observedEmission(g, TEmit);
    assert.ok(Math.abs(TObs - g * TEmit) < 1e-12);
    assert.ok(Math.abs(weight - Math.pow(TObs / T_REF, 4)) < 1e-12);
  });

  it('rejects emission at or inside the inner edge', () => {
    assert.equal(emitTemperature(6, 6), null);
    assert.equal(emitTemperature(5, 6), null);
  });
});

describe('scene constraints', () => {
  it('never leaves r_in below the ISCO or the camera inside the disk', () => {
    const scene = clampScene({
      mass: 1.6,
      diskInner: 3,
      diskOuter: 7,
      cameraDist: 10,
    });
    assert.ok(scene.diskInner >= iscoRadius(1.6) - 1e-12);
    assert.ok(scene.diskOuter >= 2.5 * scene.diskInner - 1e-12);
    assert.ok(scene.cameraDist >= 1.2 * scene.diskOuter - 1e-12);
    assert.ok(scene.escapeRadius >= 2 * scene.cameraDist - 1e-12);
  });

  it('preserves a valid Reference configuration', () => {
    const scene = clampScene({
      mass: 1,
      diskInner: 6,
      diskOuter: 15,
      cameraDist: 16,
    });
    assert.equal(scene.diskInner, 6);
    assert.equal(scene.diskOuter, 15);
    // Camera floor is max(16, 1.2 * outer) = 18 for outer = 15.
    assert.ok(Math.abs(scene.cameraDist - 18) < 1e-12);
    assert.ok(scene.escapeRadius >= 2 * scene.cameraDist - 1e-12);
  });
});
