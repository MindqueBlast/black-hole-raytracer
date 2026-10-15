# Schwarzschild Black Hole Ray-Tracer

Interactive WebGL visualization of a **Schwarzschild** black hole with a thin
accretion disk, backed by an independent CPU reference integrator and analytic
tests.

This is a computational-astrophysics teaching / research-prototype tool:
spatial null orbits are integrated with a documented Cartesian reduction of the
Schwarzschild Binet equation. It is **not** a Kerr renderer and **not** a full
general-relativistic radiative-transfer code.

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL (Vite default: `http://localhost:5173/`).

```bash
npm test          # CPU physics + shader source contract
npm run build     # production bundle → dist/
npm run preview   # serve the production build
```

## What the simulation does

1. Each pixel shoots a ray from a finite camera.
2. The ray is integrated with RK4 under
   \(\mathbf{a} = -3M h^2 \mathbf{p}/r^5\).
3. Segments are classified as captured, disk-intersecting, escaped, or exhausted.
4. Disk pixels use a circular-orbit frequency factor and a color-mapped emission model.
5. Escaped rays sample a procedural starfield; exhausted rays do not.

Details, assumptions, and citations: [docs/physics.md](docs/physics.md).

## Project layout

| Path | Role |
|------|------|
| `src/physics/geodesic.js` | CPU RK4 reference, impact parameters, termination |
| `src/physics/disk.js` | ISCO clamps, \(g\)-factors, emission helpers |
| `src/physics/model.js` | Model id / version constants |
| `src/shader.js` | GPU fragment shader (same physical model) |
| `src/main.js` | Three.js host, controls, PNG+JSON export |
| `src/ui/` | Theme, guided tour, toast, storage helpers |
| `tests/` | `node:test` analytic benchmarks |
| `docs/physics.md` | Derivation and limitations |

## Interface

- **Themes:** System (default), Light, or Dark — preference stored in `localStorage` as `bho-theme`. Changing the theme does not alter the scientific render.
- **Guided tour:** First visit shows a welcome modal. Use **Help** to replay. Progress keys: `bho-tour-done`, `bho-hint-camera`.
- **Astrophysics Guide:** Educational accordion (lensing, ray marching, horizon/Doppler) lives on [`guide.html`](./guide.html) so the simulator stays compact. Open it from **Guide** in the header.
- **Snapshot:** Downloads PNG + JSON sidecar with physical parameters.

## Reproducing a snapshot

**Snapshot** downloads:

1. `schwarzschild-raytrace-<timestamp>.png` — the framebuffer
2. `schwarzschild-raytrace-<timestamp>.json` — sidecar with
   - model id and app version
   - mass, disk radii, Doppler / horizon flags
   - camera distance, tilt, orbit
   - escape radius, max steps, integrator label
   - resolution scale and pixel size
   - presentation-only fields (swirl, blackbody scale, time)

Restore a run by setting the physical fields in the UI (or wiring them into
uniforms). Presentation fields affect appearance but not the geodesic ODE.

## Tests

```bash
npm test
```

Benchmarks include photon-sphere balance at \(r=3M\), capture/escape across
\(b_c = 3\sqrt{3}M\), weak-field deflection vs Bodenner & Will (2003), RK4
Cauchy refinement, angular-momentum drift, disk transfer identities, and a
shader source contract (mass-dependent acceleration, no exhausted starfield,
no disk emission inside the horizon).

## Known limitations

- Euclidean camera directions at finite \(r_{\mathrm{cam}}\) (\(O(M/r_{\mathrm{cam}})\) sky error).
- Spatial ODE only; no \(g_{\mu\nu}k^\mu k^\nu\) monitoring in the GPU path.
- Disk model is thin, circular, and color-mapped — not GR radiative transfer.
- GPU float32 vs CPU float64 differences are expected.
- No automated per-ray GPU readback comparison in CI.

## License

See the repository license file if present; otherwise treat as the upstream
project’s license.
