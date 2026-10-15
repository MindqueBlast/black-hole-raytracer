/**
 * Cartesian Schwarzschild null-orbit integrator (spatial trajectory).
 *
 * State: position p and velocity v = dp/dλ in geometric units (G = c = 1).
 * Acceleration: a = -3 M h² p / r⁵ with launch h² = |p × v|² held fixed.
 *
 * This is not a four-momentum integrator; g_μν k^μ k^ν is not enforced.
 */

import { DEFAULT_MAX_STEPS, SINGULARITY_CUTOFF } from './model.js';

export const OUTCOME = Object.freeze({
  CAPTURED: 'captured',
  ESCAPED: 'escaped',
  EXHAUSTED: 'exhausted',
  INVALID: 'invalid',
});

function isFiniteVec3(v) {
  return (
    Number.isFinite(v.x) &&
    Number.isFinite(v.y) &&
    Number.isFinite(v.z)
  );
}

export function vec3(x, y, z) {
  return { x, y, z };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(a) {
  return Math.hypot(a.x, a.y, a.z);
}

export function normalize(a) {
  const L = length(a);
  if (!(L > 0)) return vec3(0, 0, 0);
  return scale(a, 1 / L);
}

/** Instantaneous specific angular momentum squared |p × v|². */
export function angularMomentumSquared(p, v) {
  const L = cross(p, v);
  return dot(L, L);
}

/**
 * Schwarzschild Cartesian acceleration a = -3 M h² p / r⁵.
 * @param {{x:number,y:number,z:number}} p
 * @param {number} mass
 * @param {number} h2 launch |p × v|²
 */
export function acceleration(p, mass, h2) {
  const r2 = dot(p, p);
  if (!(r2 > 0) || !(mass > 0) || !Number.isFinite(h2)) {
    return vec3(NaN, NaN, NaN);
  }
  const r = Math.sqrt(r2);
  const r5 = r2 * r2 * r;
  const coeff = (-3 * mass * h2) / r5;
  return scale(p, coeff);
}

/**
 * Suggested RK4 step length (same expression as the GPU shader).
 * Scales with M, shrinks near the horizon, and clamps for stability.
 */
export function suggestedStep(r, mass, { horizonEnabled = true } = {}) {
  const rs = 2 * mass;
  const rsEff = horizonEnabled ? rs : 0;
  const raw = 0.075 * (r - 0.95 * rsEff);
  const minDt = 0.012 * Math.max(mass, 1e-6);
  const maxDt = 0.25 * Math.max(mass, 1e-6);
  return Math.min(maxDt, Math.max(minDt, raw));
}

/** Classical RK4 step for dv/dλ = a(p), dp/dλ = v. */
export function rk4Step(p, v, mass, h2, dt) {
  const a1 = acceleration(p, mass, h2);
  const p2 = add(p, scale(v, 0.5 * dt));
  const v2 = add(v, scale(a1, 0.5 * dt));
  const a2 = acceleration(p2, mass, h2);
  const p3 = add(p, scale(v2, 0.5 * dt));
  const v3 = add(v, scale(a2, 0.5 * dt));
  const a3 = acceleration(p3, mass, h2);
  const p4 = add(p, scale(v3, dt));
  const v4 = add(v, scale(a3, dt));
  const a4 = acceleration(p4, mass, h2);

  const pNext = add(
    p,
    scale(
      add(add(v, scale(v2, 2)), add(scale(v3, 2), v4)),
      dt / 6
    )
  );
  const vNext = add(
    v,
    scale(
      add(add(a1, scale(a2, 2)), add(scale(a3, 2), a4)),
      dt / 6
    )
  );
  return { p: pNext, v: vNext };
}

/**
 * Asymptotic speed squared from the Cartesian energy of the ODE:
 * E_cart = |v|²/2 - M h² / r³  ⇒  v_∞² = |v|² - 2 M h² / r³.
 */
export function asymptoticSpeedSquared(p, v, mass, h2) {
  const r = length(p);
  if (!(r > 0)) return NaN;
  return dot(v, v) - (2 * mass * h2) / (r * r * r);
}

/**
 * Impact parameter of the orbit shape: b = h / v_∞.
 * Signed axial impact about +y: λ = L_y / v_∞.
 */
export function impactParameters(p, v, mass) {
  const L = cross(p, v);
  const h2 = dot(L, L);
  const h = Math.sqrt(h2);
  const vInf2 = asymptoticSpeedSquared(p, v, mass, h2);
  if (!(vInf2 > 0)) {
    return { h2, h, vInf2, b: NaN, lambdaY: NaN };
  }
  const vInf = Math.sqrt(vInf2);
  return {
    h2,
    h,
    vInf2,
    b: h / vInf,
    lambdaY: L.y / vInf,
  };
}

/** Critical impact parameter b_c = 3 √3 M. */
export function criticalImpactParameter(mass) {
  return 3 * Math.sqrt(3) * mass;
}

/**
 * Segment parameter t ∈ [0,1] where |p(t)| = radius for a linear mix of endpoints.
 * Returns the smallest root in [0,1], or null.
 */
export function radiusCrossingParameter(p0, p1, radius) {
  const R2 = radius * radius;
  const d = sub(p1, p0);
  const a = dot(d, d);
  const b = 2 * dot(p0, d);
  const c = dot(p0, p0) - R2;
  if (!(a > 0)) return null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const tA = (-b - s) / (2 * a);
  const tB = (-b + s) / (2 * a);
  let best = null;
  for (const t of [tA, tB]) {
    if (t >= 0 && t <= 1) {
      if (best === null || t < best) best = t;
    }
  }
  return best;
}

/** Segment parameter for entering the horizon sphere (requires inward crossing). */
export function horizonCrossingParameter(p0, p1, rs) {
  const r0 = length(p0);
  const r1 = length(p1);
  if (!(r0 > rs && r1 <= rs)) return null;
  return radiusCrossingParameter(p0, p1, rs);
}

/** Plane y = 0 crossing parameter on the segment, or null. */
export function planeCrossingParameter(p0, p1) {
  if (p0.y * p1.y > 0) return null;
  if (p0.y === 0) return 0;
  const dy = p1.y - p0.y;
  if (dy === 0) return null;
  const t = -p0.y / dy;
  if (t < 0 || t > 1) return null;
  return t;
}

/**
 * Integrate a ray until capture, escape, or step budget exhaustion.
 *
 * @param {object} options
 * @param {{x:number,y:number,z:number}} options.position
 * @param {{x:number,y:number,z:number}} options.velocity
 * @param {number} options.mass
 * @param {number} [options.escapeRadius]
 * @param {number} [options.maxSteps]
 * @param {boolean} [options.horizonEnabled]
 * @param {number|null} [options.fixedDt] if set, use constant dt instead of suggestedStep
 * @param {boolean} [options.trackDiagnostics]
 */
export function integrate({
  position,
  velocity,
  mass,
  escapeRadius = 60,
  maxSteps = DEFAULT_MAX_STEPS,
  horizonEnabled = true,
  fixedDt = null,
  trackDiagnostics = false,
} = {}) {
  if (
    !(mass > 0) ||
    !isFiniteVec3(position) ||
    !isFiniteVec3(velocity) ||
    !(escapeRadius > 0) ||
    !(maxSteps > 0) ||
    (fixedDt !== null && !(fixedDt > 0))
  ) {
    return {
      outcome: OUTCOME.INVALID,
      position,
      velocity,
      steps: 0,
      h2Launch: NaN,
      maxH2Drift: NaN,
      path: trackDiagnostics ? [position] : undefined,
    };
  }

  let p = { ...position };
  let v = { ...velocity };
  const h2 = angularMomentumSquared(p, v);
  const rs = 2 * mass;
  const r0 = length(p);

  if (horizonEnabled && r0 <= rs) {
    return {
      outcome: OUTCOME.CAPTURED,
      position: p,
      velocity: v,
      steps: 0,
      h2Launch: h2,
      maxH2Drift: 0,
      path: trackDiagnostics ? [p] : undefined,
    };
  }
  if (!horizonEnabled && r0 < SINGULARITY_CUTOFF) {
    return {
      outcome: OUTCOME.CAPTURED,
      position: p,
      velocity: v,
      steps: 0,
      h2Launch: h2,
      maxH2Drift: 0,
      path: trackDiagnostics ? [p] : undefined,
    };
  }

  let maxH2Drift = 0;
  const path = trackDiagnostics ? [{ ...p }] : undefined;

  for (let step = 0; step < maxSteps; step++) {
    const r = length(p);
    if (!Number.isFinite(r) || !isFiniteVec3(v)) {
      return {
        outcome: OUTCOME.INVALID,
        position: p,
        velocity: v,
        steps: step,
        h2Launch: h2,
        maxH2Drift,
        path,
      };
    }

    const dt =
      fixedDt !== null
        ? fixedDt
        : suggestedStep(r, mass, { horizonEnabled });

    if (!(dt > 0)) {
      return {
        outcome: OUTCOME.INVALID,
        position: p,
        velocity: v,
        steps: step,
        h2Launch: h2,
        maxH2Drift,
        path,
      };
    }

    const pPrev = p;
    const next = rk4Step(p, v, mass, h2, dt);
    p = next.p;
    v = next.v;

    const h2Now = angularMomentumSquared(p, v);
    if (h2 > 0) {
      maxH2Drift = Math.max(maxH2Drift, Math.abs(h2Now - h2) / h2);
    }

    if (trackDiagnostics) path.push({ ...p });

    const rNext = length(p);
    let tHorizon = null;
    if (horizonEnabled) {
      tHorizon = horizonCrossingParameter(pPrev, p, rs);
      if (tHorizon === null && rNext <= rs) tHorizon = 1;
    } else if (rNext < SINGULARITY_CUTOFF) {
      tHorizon = 1;
    }

    // Escape: first outward crossing of the escape sphere (segment parameter).
    let tEscape = null;
    if (r < escapeRadius && rNext >= escapeRadius && dot(p, v) > 0) {
      tEscape = radiusCrossingParameter(pPrev, p, escapeRadius);
      if (tEscape === null) tEscape = 1;
    } else if (rNext >= escapeRadius && r >= escapeRadius && dot(p, v) > 0) {
      // Already outside (e.g. coarse overshoot on the previous logic path).
      tEscape = 0;
    }

    if (tHorizon !== null && (tEscape === null || tHorizon <= tEscape)) {
      const hit = add(pPrev, scale(sub(p, pPrev), tHorizon));
      return {
        outcome: OUTCOME.CAPTURED,
        position: hit,
        velocity: v,
        steps: step + 1,
        h2Launch: h2,
        maxH2Drift,
        path,
      };
    }

    if (tEscape !== null) {
      const hit = add(pPrev, scale(sub(p, pPrev), tEscape));
      return {
        outcome: OUTCOME.ESCAPED,
        position: hit,
        velocity: v,
        steps: step + 1,
        h2Launch: h2,
        maxH2Drift,
        path,
      };
    }
  }

  return {
    outcome: OUTCOME.EXHAUSTED,
    position: p,
    velocity: v,
    steps: maxSteps,
    h2Launch: h2,
    maxH2Drift,
    path,
  };
}

/**
 * Launch a ray from far along +x with impact parameter b in the x–z plane
 * (miss distance along +z), unit speed toward −x.
 */
export function asymptoticRay(mass, b, {
  launchRadius = 200 * mass,
  escapeRadius = 200 * mass,
} = {}) {
  const position = vec3(launchRadius, 0, b);
  const velocity = vec3(-1, 0, 0);
  return { position, velocity, mass, escapeRadius };
}

/**
 * Asymptotic deflection for an escaped equatorial ray.
 * δ is the angle between the initial and final velocity directions
 * (straight line ⇒ 0). Uses velocity asymptotes, not path winding.
 */
export function measureDeflection(mass, b, options = {}) {
  const ray = asymptoticRay(mass, b, options);
  const vIn = normalize(ray.velocity);
  const result = integrate({
    ...ray,
    maxSteps: options.maxSteps ?? 20000,
    fixedDt: options.fixedDt ?? null,
    trackDiagnostics: false,
    horizonEnabled: true,
  });
  if (result.outcome !== OUTCOME.ESCAPED) {
    return { ...result, deflection: NaN };
  }
  const vOut = normalize(result.velocity);
  const c = Math.max(-1, Math.min(1, dot(vIn, vOut)));
  const deflection = Math.acos(c);
  return { ...result, deflection };
}

/** Bodenner–Will second-order weak deflection for impact parameter b. */
export function weakDeflectionSeries(mass, b) {
  const x = mass / b;
  return 4 * x + (15 * Math.PI) / 4 * x * x;
}
