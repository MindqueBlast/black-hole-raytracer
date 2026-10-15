/** Scientific model identity for exports and documentation. */
export const MODEL_ID = 'schwarzschild-cartesian-v1';

/** Application version recorded in sidecars (keep in sync with package.json). */
export const APP_VERSION = '0.1.0';

/** Default RK4 step budget for camera rays (matches the GPU shader). */
export const DEFAULT_MAX_STEPS = 400;

/** Color-scale reference temperature for bolometric weighting (K). */
export const T_REF = 6000;

/** Soft singularity cutoff used when the horizon test is disabled. */
export const SINGULARITY_CUTOFF = 0.1;
