/**
 * Thin equatorial disk helpers for Schwarzschild circular emitters.
 *
 * Not a full radiative-transfer solution. Frequency factor g uses the
 * standard circular-orbit formula; intensity uses a color-mapped blackbody
 * scale with a single bolometric (T_obs/T_ref)⁴ weight.
 */

import { T_REF } from './model.js';

export { T_REF };

/** Innermost stable circular orbit for Schwarzschild: r_isco = 6M. */
export function iscoRadius(mass) {
  return 6 * mass;
}

/** Event horizon: r_s = 2M. */
export function horizonRadius(mass) {
  return 2 * mass;
}

/** Photon sphere: r_ph = 3M. */
export function photonSphereRadius(mass) {
  return 3 * mass;
}

/** Keplerian angular velocity as seen from infinity: Ω = √(M/r³). */
export function keplerOmega(mass, r) {
  if (!(mass > 0) || !(r > 0)) return NaN;
  return Math.sqrt(mass / (r * r * r));
}

/** Static emitter gravitational shift to infinity: √(1 − 2M/r). */
export function staticGravitationalShift(mass, r) {
  if (!(r > 2 * mass)) return null;
  return Math.sqrt(1 - (2 * mass) / r);
}

/**
 * Circular-orbit frequency factor to infinity.
 *
 * Face-on / Doppler off: g = √(1 − 3M/r).
 * With Doppler: g = √(1 − 3M/r) / (1 − Ω λ), where λ = L_y / v_∞ is the
 * signed axial impact parameter of the photon orbit (disk axis +y).
 *
 * @returns {number|null} g, or null if undefined for the arguments
 */
export function circularEmitterShift(mass, r, {
  dopplerEnabled = false,
  lambdaY = 0,
} = {}) {
  if (!(mass > 0) || !(r > 3 * mass)) return null;
  const base = Math.sqrt(1 - (3 * mass) / r);
  if (!dopplerEnabled) return base;
  const omega = keplerOmega(mass, r);
  if (!Number.isFinite(omega) || !Number.isFinite(lambdaY)) return null;
  const denom = 1 - omega * lambdaY;
  if (!(denom > 0)) return null;
  return base / denom;
}

/**
 * Zero-torque thin-disk temperature shape (Page & Thorne 1974 factor),
 * scaled to a color-reference temperature T_ref at a characteristic radius.
 *
 * T_emit(r) = T_ref · (r_char / r)^{3/4} · (1 − √(r_in/r))^{1/4}
 * with r_char chosen so the peak stays near T_ref for typical disks.
 */
export function emitTemperature(r, rInner, {
  tRef = T_REF,
  rChar = null,
} = {}) {
  if (!(r > rInner) || !(rInner > 0)) return null;
  const char = rChar ?? rInner * 1.5;
  const radial = Math.pow(char / r, 0.75);
  const boundary = Math.pow(1 - Math.sqrt(rInner / r), 0.25);
  const T = tRef * radial * boundary;
  if (!Number.isFinite(T) || T <= 0) return null;
  return T;
}

/**
 * Observed temperature and single bolometric weight.
 * Uses T_obs = g T_emit once; does not apply an extra g^n to intensity.
 */
export function observedEmission(g, TEmit, { tRef = T_REF } = {}) {
  if (!(g > 0) || !(TEmit > 0) || !(tRef > 0)) return null;
  const TObs = g * TEmit;
  const weight = Math.pow(TObs / tRef, 4);
  return { TObs, weight };
}

/**
 * Clamp disk radii, camera distance, and escape radius to a valid scene.
 * Inner edge is at least the ISCO (6M). Camera stays outside the disk.
 */
export function clampScene({
  mass,
  diskInner,
  diskOuter,
  cameraDist = 16,
  minCameraFloor = 16,
  minGap = 0.2,
} = {}) {
  if (!(mass > 0)) {
    return {
      mass: NaN,
      diskInner: NaN,
      diskOuter: NaN,
      cameraDist: NaN,
      escapeRadius: NaN,
      isco: NaN,
    };
  }

  const isco = iscoRadius(mass);
  let inner = Math.max(diskInner, isco);
  // Keep enough radial span that the Page–Thorne peak (~1.5 r_in) lies on the disk.
  const minOuter = Math.max(inner + minGap, 2.5 * inner, 12 * mass);
  let outer = Math.max(diskOuter, minOuter);
  if (outer <= inner + minGap) outer = inner + minGap;

  const camFloor = Math.max(minCameraFloor, 1.2 * outer);
  const camera = Math.max(cameraDist, camFloor);
  const escapeRadius = Math.max(2 * camera, 30);

  return {
    mass,
    diskInner: inner,
    diskOuter: outer,
    cameraDist: camera,
    escapeRadius,
    isco,
  };
}
