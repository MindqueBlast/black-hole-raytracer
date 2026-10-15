# Physical model and numerical contract

This document describes the Schwarzschild ray model implemented in
`src/physics/` (CPU reference) and `src/shader.js` (GPU renderer).

## Units and conventions

- Geometric units: \(G = c = 1\).
- Mass \(M\) has the same dimension as length. Radii are reported in those units.
- Standard radii:
  - Event horizon: \(r_s = 2M\)
  - Photon sphere: \(r_{\mathrm{ph}} = 3M\)
  - Innermost stable circular orbit (timelike): \(r_{\mathrm{isco}} = 6M\)

## State vector

Each ray is a Euclidean position \(\mathbf{p}\) and velocity \(\mathbf{v} = d\mathbf{p}/d\lambda\).

- \(\lambda\) is an affine-like parameter for this spatial ODE. It is **not**
  Schwarzschild coordinate time and **not** proper time.
- \(\mathbf{v}\) is **not** a photon four-momentum. The null constraint
  \(g_{\mu\nu} k^\mu k^\nu = 0\) is not enforced as a state condition.

Launch angular momentum is frozen for the force law:

\[
h^2 = |\mathbf{p}\times\mathbf{v}|^2\Big|_{\mathrm{launch}}.
\]

The conservation diagnostic is the relative drift of the instantaneous
\(|\mathbf{p}\times\mathbf{v}|^2\) along the trajectory.

## Equation of motion

Schwarzschild equatorial null orbits obey the Binet equation

\[
\frac{d^2u}{d\phi^2} + u = 3Mu^2, \qquad u = 1/r.
\]

With \(h = r^2 d\phi/d\lambda\), the equivalent Cartesian acceleration used here is

\[
\mathbf{a} = -\frac{3Mh^2}{r^5}\mathbf{p}.
\]

Properties:

- \(M = 0\) recovers straight-line motion.
- Circular balance \( \ddot r = a_r + h^2/r^3 = 0 \) holds at \(r = 3M\) for any
  tangential speed, identifying the photon sphere.
- Critical impact parameter for capture from infinity:
  \(b_c = 3\sqrt{3}\,M\).

Asymptotic impact parameter of an orbit shape:

\[
v_\infty^2 = |\mathbf{v}|^2 - \frac{2Mh^2}{r^3}, \qquad
b = \frac{h}{v_\infty}, \qquad
\lambda_y = \frac{L_y}{v_\infty},
\]

where \(\mathbf{L} = \mathbf{p}\times\mathbf{v}\) and the disk axis is \(+y\).

## Integration

- Method: classical RK4 on \((\mathbf{p},\mathbf{v})\).
- Suggested step (CPU and GPU share the expression):

  \[
  \Delta\lambda = \mathrm{clamp}\big(0.075\,(r - 0.95\,r_{s,\mathrm{eff}}),\;
  0.012M,\; 0.25M\big).
  \]

- Default GPU step budget: 400.
- Outcomes: `captured`, `escaped`, `exhausted`, `invalid`.
- Horizon and escape use segment sphere crossings; disk hits use the \(y=0\)
  plane crossing. Horizon entry wins if it occurs first on a segment.
- Exhausted rays must not sample the background starfield.

## Camera limitation

Pixels use Euclidean unit directions from a finite camera radius \(r_{\mathrm{cam}}\).
That sky map matches a static observer at infinity only through
\(O(M/r_{\mathrm{cam}})\). No tetrad transport is applied in this version.

## Disk emission model

Assumptions:

- Infinitely thin equatorial disk.
- Emitters on stable circular orbits: inner edge \(\ge 6M\).
- Scene clamp keeps the outer radius large enough that the approximate
  Page–Thorne temperature peak (\(\sim 1.5\,r_{\mathrm{in}}\)) lies on the disk
  (`outer ≥ max(2.5 r_in, 12M)`).
- Keplerian angular velocity from infinity: \(\Omega = \sqrt{M/r^3}\).

Frequency factor to infinity for a circular emitter:

- Doppler off: \(g = \sqrt{1-3M/r}\)
- Doppler on: \(g = \sqrt{1-3M/r}\,/\,(1-\Omega\lambda_y)\)

Static gravitational shift \(\sqrt{1-2M/r}\) is implemented for tests and
documentation; it is **not** used for the orbiting disk.

Temperature uses a zero-torque thin-disk radial factor
(Page & Thorne 1974), scaled to a color reference \(T_{\mathrm{ref}} = 6000\,\mathrm{K}\).
Observed temperature is \(T_{\mathrm{obs}} = g\,T_{\mathrm{emit}}\) once.
Bolometric weight is \((T_{\mathrm{obs}}/T_{\mathrm{ref}})^4\). Chromaticity uses the
Tanner Helland blackbody fit. There is **no** additional \(g^{3.5}\) multiplier.

Procedural fBm swirl is an artistic emissivity modulator in \((0.4,1)\).

This is **not** general-relativistic radiative transfer.

## CPU vs GPU

- CPU reference: IEEE-754 float64 in `src/physics/geodesic.js`.
- GPU shader: typically float32 in `src/shader.js`.
- Exact bit agreement is not expected. Classification and weak-field
  deflection should agree within truncation and float32 noise for ordinary rays.

## References

1. Schwarzschild null orbits; photon sphere \(r_{\mathrm{ph}}=3M\); critical impact
   \(b_c = 3\sqrt{3}\,M\) (standard GR textbooks / geodesic reduction).
2. J. M. Bardeen, W. H. Press, and S. A. Teukolsky, *Astrophysical Journal*
   **178**, 347 (1972) — circular orbits and the Schwarzschild ISCO at \(6M\).
3. J.-P. Luminet, *Astronomy & Astrophysics* **75**, 228 (1979) — thin-disk
   image morphology this project only approximates.
4. J. Bodenner and C. M. Will, *American Journal of Physics* **71**, 770 (2003),
   eq. (29) — weak deflection
   \(\Delta\phi = 4M/b + (15\pi/4)(M/b)^2 + O((M/b)^3)\).
5. D. N. Page and K. S. Thorne, *Astrophysical Journal* **191**, 499 (1974) —
   zero-torque disk temperature factor.

## Explicit non-claims

- Not Kerr / no black-hole spin.
- Not a research-grade imaging pipeline.
- Not full GR radiative transfer or polarized transfer.
- “Horizon cutoff off” is a visualization switch, not a naked-singularity spacetime.
