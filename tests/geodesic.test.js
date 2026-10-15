import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTCOME,
  acceleration,
  angularMomentumSquared,
  asymptoticRay,
  criticalImpactParameter,
  integrate,
  measureDeflection,
  rk4Step,
  suggestedStep,
  vec3,
  weakDeflectionSeries,
  impactParameters,
} from '../src/physics/geodesic.js';

describe('photon sphere', () => {
  it('centrifugal balance holds at r = 3M (r̈ = a_r + h²/r³ = 0)', () => {
    const M = 1;
    const r = 3 * M;
    const p = vec3(r, 0, 0);
    const v = vec3(0, 0, 1); // tangential in the equatorial plane
    const h2 = angularMomentumSquared(p, v);
    const a = acceleration(p, M, h2);
    const aRadial = (a.x * p.x + a.y * p.y + a.z * p.z) / r;
    const rDDot = aRadial + h2 / (r * r * r);
    assert.ok(Math.abs(rDDot) < 1e-12, `r̈ = ${rDDot}`);
  });

  it('centrifugal balance at r = 3M is independent of tangential speed', () => {
    const M = 2.5;
    const r = 3 * M;
    const p = vec3(0, 0, r);
    for (const speed of [0.25, 1, 4]) {
      const v = vec3(speed, 0, 0);
      const h2 = angularMomentumSquared(p, v);
      const a = acceleration(p, M, h2);
      const aRadial = (a.x * p.x + a.y * p.y + a.z * p.z) / r;
      const rDDot = aRadial + h2 / (r * r * r);
      assert.ok(Math.abs(rDDot) < 1e-12, `speed=${speed}, r̈=${rDDot}`);
    }
  });

  it('circular orbits are unstable away from r = 3M', () => {
    const M = 1;
    for (const r of [2.5 * M, 3.5 * M]) {
      const p = vec3(r, 0, 0);
      const v = vec3(0, 0, 1);
      const h2 = angularMomentumSquared(p, v);
      const a = acceleration(p, M, h2);
      const aRadial = (a.x * p.x + a.y * p.y + a.z * p.z) / r;
      const rDDot = aRadial + h2 / (r * r * r);
      assert.ok(Math.abs(rDDot) > 1e-6, `r=${r}, r̈=${rDDot}`);
    }
  });
});

describe('critical impact parameter', () => {
  it('captures below b_c and escapes above b_c with a 5% margin', () => {
    const M = 1;
    const bc = criticalImpactParameter(M);
    assert.ok(Math.abs(bc - 3 * Math.sqrt(3) * M) < 1e-15);

    const low = asymptoticRay(M, bc * 0.95, {
      launchRadius: 400 * M,
      escapeRadius: 400 * M,
    });
    const high = asymptoticRay(M, bc * 1.05, {
      launchRadius: 400 * M,
      escapeRadius: 400 * M,
    });

    const captured = integrate({
      ...low,
      maxSteps: 50000,
      fixedDt: 0.05 * M,
    });
    const escaped = integrate({
      ...high,
      maxSteps: 50000,
      fixedDt: 0.05 * M,
    });

    assert.equal(captured.outcome, OUTCOME.CAPTURED);
    assert.equal(escaped.outcome, OUTCOME.ESCAPED);
  });
});

describe('weak-field deflection and RK4 convergence', () => {
  it('RK4 state error converges at least order 3 under fixed-time refinement', () => {
    const M = 1;
    const b = 15 * M;
    const ray = asymptoticRay(M, b, {
      launchRadius: 80 * M,
      escapeRadius: 1e9,
    });
    // Fixed affine time; compare final z after n, 2n, 4n steps.
    // Step sizes are large enough that truncation dominates roundoff.
    const T = 120;
    const run = (n) => {
      const dt = T / n;
      let p = { ...ray.position };
      let v = { ...ray.velocity };
      const h2 = angularMomentumSquared(p, v);
      for (let i = 0; i < n; i++) {
        const next = rk4Step(p, v, M, h2, dt);
        p = next.p;
        v = next.v;
      }
      return p.z;
    };
    const z1 = run(50);
    const z2 = run(100);
    const z4 = run(200);
    const e1 = Math.abs(z1 - z2);
    const e2 = Math.abs(z2 - z4);
    assert.ok(e2 > 0, 'refinement must change the state');
    const ratio = e1 / e2;
    assert.ok(ratio >= 8, `Cauchy ratio expected ≥ 8 for RK4, got ${ratio}`);
  });

  it('matches the Bodenner–Will second-order series at b = 100M', () => {
    const M = 1;
    const b = 100 * M;
    const fine = measureDeflection(M, b, {
      launchRadius: 2000 * M,
      escapeRadius: 2000 * M,
      fixedDt: 0.25,
      maxSteps: 500000,
    });
    assert.equal(fine.outcome, OUTCOME.ESCAPED);

    const delta = fine.deflection;
    const first = (4 * M) / b;
    const second = weakDeflectionSeries(M, b);
    const secondTerm = second - first;

    const err1 = Math.abs(delta - first);
    const err2 = Math.abs(delta - second);
    assert.ok(
      err2 * 5 <= err1,
      `second-order should beat first-order by ≥5×: err1=${err1}, err2=${err2}`
    );
    assert.ok(
      err2 < 0.15 * Math.abs(secondTerm),
      `err2=${err2} exceeds 15% of second term ${secondTerm}`
    );
  });
});

describe('angular momentum conservation', () => {
  it('relative h² drift shrinks when the step is halved', () => {
    const M = 1;
    const b = 100 * M;
    const ray = asymptoticRay(M, b, {
      launchRadius: 400 * M,
      escapeRadius: 400 * M,
    });

    const coarse = integrate({
      ...ray,
      fixedDt: 0.4,
      maxSteps: 100000,
    });
    const fine = integrate({
      ...ray,
      fixedDt: 0.2,
      maxSteps: 200000,
    });

    assert.equal(coarse.outcome, OUTCOME.ESCAPED);
    assert.equal(fine.outcome, OUTCOME.ESCAPED);
    assert.ok(fine.maxH2Drift < coarse.maxH2Drift);
    assert.ok(fine.maxH2Drift < 1e-6, `drift=${fine.maxH2Drift}`);
  });
});

describe('capture, escape, and edge cases', () => {
  it('classifies a launch inside the horizon as captured', () => {
    const M = 1;
    const result = integrate({
      position: vec3(1.5, 0, 0),
      velocity: vec3(0, 0, 1),
      mass: M,
    });
    assert.equal(result.outcome, OUTCOME.CAPTURED);
    assert.equal(result.steps, 0);
  });

  it('returns exhausted when the step budget is tiny', () => {
    const M = 1;
    const ray = asymptoticRay(M, 20 * M, {
      launchRadius: 200 * M,
      escapeRadius: 200 * M,
    });
    const result = integrate({
      ...ray,
      maxSteps: 2,
      fixedDt: 0.01,
    });
    assert.equal(result.outcome, OUTCOME.EXHAUSTED);
  });

  it('rejects non-positive mass and non-finite state', () => {
    assert.equal(
      integrate({
        position: vec3(10, 0, 0),
        velocity: vec3(-1, 0, 0),
        mass: 0,
      }).outcome,
      OUTCOME.INVALID
    );
    assert.equal(
      integrate({
        position: vec3(NaN, 0, 0),
        velocity: vec3(-1, 0, 0),
        mass: 1,
      }).outcome,
      OUTCOME.INVALID
    );
    assert.equal(
      integrate({
        position: vec3(10, 0, 0),
        velocity: vec3(-1, 0, 0),
        mass: 1,
        fixedDt: 0,
      }).outcome,
      OUTCOME.INVALID
    );
  });

  it('suggestedStep shrinks near the horizon and scales with mass', () => {
    const near = suggestedStep(2.1, 1, { horizonEnabled: true });
    const far = suggestedStep(20, 1, { horizonEnabled: true });
    assert.ok(near < far);
    const scaled = suggestedStep(40, 2, { horizonEnabled: true });
    const unscaled = suggestedStep(20, 1, { horizonEnabled: true });
    assert.ok(Math.abs(scaled - 2 * unscaled) < 1e-12);
  });

  it('rk4Step advances a free particle when M h² = 0 effectively', () => {
    // h2 = 0 ⇒ a = 0 for any M
    const p = vec3(5, 0, 0);
    const v = vec3(0, 1, 0);
    const next = rk4Step(p, v, 1, 0, 0.1);
    assert.ok(Math.abs(next.p.y - 0.1) < 1e-12);
    assert.ok(Math.abs(next.v.y - 1) < 1e-12);
  });

  it('impact parameter recovers the asymptotic b = h/v_∞', () => {
    const M = 1;
    const bGeom = 50;
    const ray = asymptoticRay(M, bGeom, { launchRadius: 5000 });
    const params = impactParameters(ray.position, ray.velocity, M);
    assert.ok(Number.isFinite(params.b));
    assert.ok(Math.abs(params.b - params.h / Math.sqrt(params.vInf2)) < 1e-12);
    // At large launch radius the geometric miss matches asymptotic b.
    assert.ok(Math.abs(params.b - bGeom) / bGeom < 1e-4);
  });
});
