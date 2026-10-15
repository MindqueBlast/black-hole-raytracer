import * as THREE from 'three';
import { vertexShader, fragmentShader } from './shader.js';
import { clampScene } from './physics/disk.js';
import { MODEL_ID, APP_VERSION, DEFAULT_MAX_STEPS } from './physics/model.js';
import { initTheme } from './ui/theme.js';
import { initTour } from './ui/tour.js';
import { showToast } from './ui/toast.js';
import './style.css';

const canvas = document.getElementById('raytracer-canvas');
const container = document.getElementById('canvas-container');
const fpsCounter = document.getElementById('fps-counter');
const rsDisplay = document.getElementById('rs-display');
const rpDisplay = document.getElementById('rp-display');
const pauseBadge = document.getElementById('pause-badge');

const sliderMass = document.getElementById('slider-mass');
const sliderDiskInner = document.getElementById('slider-disk-inner');
const sliderDiskOuter = document.getElementById('slider-disk-outer');
const sliderTilt = document.getElementById('slider-tilt');

const inputMass = document.getElementById('input-mass');
const inputDiskInner = document.getElementById('input-disk-inner');
const inputDiskOuter = document.getElementById('input-disk-outer');
const inputTilt = document.getElementById('input-tilt');

const valMass = document.getElementById('val-mass');
const valDiskRange = document.getElementById('val-disk-range');
const valTilt = document.getElementById('val-tilt');

const toggleDoppler = document.getElementById('toggle-doppler');
const toggleHorizonOff = document.getElementById('toggle-horizon-off');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnReset = document.getElementById('btn-reset');
const btnExport = document.getElementById('btn-export');
const btnHelp = document.getElementById('btn-help');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const playPauseLabel = document.getElementById('play-pause-label');

const presetReference = document.getElementById('preset-reference');
const presetInclined = document.getElementById('preset-inclined');
const presetHorizonOff = document.getElementById('preset-horizon-off');
const resButtons = document.querySelectorAll('.res-btn');

const infoCamDist = document.getElementById('info-cam-dist');
const infoCamOrbit = document.getElementById('info-cam-orbit');
const infoDisk = document.getElementById('info-disk');
const infoDoppler = document.getElementById('info-doppler');
const infoHorizon = document.getElementById('info-horizon');
const infoRs = document.getElementById('info-rs');
const infoRph = document.getElementById('info-rph');
const infoRisco = document.getElementById('info-risco');
const infoEscape = document.getElementById('info-escape');
const infoResolution = document.getElementById('info-resolution');
const infoScale = document.getElementById('info-scale');
const infoMaxSteps = document.getElementById('info-max-steps');
const infoModelId = document.getElementById('info-model-id');

let isPaused = false;
let needsRender = true;
const clock = new THREE.Clock();
let accumulatedTime = 0;
let frameCount = 0;
let lastFpsUpdate = 0;
let renderScale = 0.8;

let camOrbit = 0.0;
let camTilt = THREE.MathUtils.degToRad(8);
const minTilt = -1.48;
const maxTilt = 1.48;

let isDragging = false;
let prevMousePos = { x: 0, y: 0 };

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  preserveDrawingBuffer: true,
});

const initialScene = clampScene({
  mass: parseFloat(sliderMass.value),
  diskInner: parseFloat(sliderDiskInner.value),
  diskOuter: parseFloat(sliderDiskOuter.value),
  cameraDist: 16,
});

const uniforms = {
  uResolution: { value: new THREE.Vector2() },
  uTime: { value: 0.0 },
  uMass: { value: initialScene.mass },
  uDiskInner: { value: initialScene.diskInner },
  uDiskOuter: { value: initialScene.diskOuter },
  uCameraTilt: { value: camTilt },
  uCameraOrbit: { value: camOrbit },
  uCameraDist: { value: initialScene.cameraDist },
  uEscapeRadius: { value: initialScene.escapeRadius },
  uDopplerEnabled: { value: toggleDoppler.checked },
  uHorizonEnabled: { value: !toggleHorizonOff.checked },
};

const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms,
  depthWrite: false,
  depthTest: false,
});
scene.add(new THREE.Mesh(geometry, material));

function markDirty() {
  needsRender = true;
}

function resizeCanvas() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  const scaledWidth = Math.max(1, Math.floor(width * renderScale));
  const scaledHeight = Math.max(1, Math.floor(height * renderScale));
  renderer.setSize(scaledWidth, scaledHeight, false);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  uniforms.uResolution.value.set(scaledWidth, scaledHeight);
  if (infoResolution) {
    infoResolution.textContent = `${scaledWidth} × ${scaledHeight}`;
  }
  if (infoScale) infoScale.textContent = String(renderScale);
  markDirty();
}

function syncControlsFromScene(sceneState) {
  sliderMass.value = String(sceneState.mass);
  sliderDiskInner.value = String(sceneState.diskInner);
  sliderDiskOuter.value = String(sceneState.diskOuter);
  if (inputMass) inputMass.value = sceneState.mass.toFixed(2);
  if (inputDiskInner) inputDiskInner.value = sceneState.diskInner.toFixed(1);
  if (inputDiskOuter) inputDiskOuter.value = sceneState.diskOuter.toFixed(1);
}

function updateHudValues() {
  const mass = parseFloat(sliderMass.value);
  let inner = parseFloat(sliderDiskInner.value);
  let outer = parseFloat(sliderDiskOuter.value);
  const tilt = parseInt(sliderTilt.value, 10);

  const sceneState = clampScene({
    mass,
    diskInner: inner,
    diskOuter: outer,
    cameraDist: uniforms.uCameraDist.value,
  });

  if (
    Math.abs(sceneState.diskInner - inner) > 1e-6 ||
    Math.abs(sceneState.diskOuter - outer) > 1e-6 ||
    Math.abs(sceneState.mass - mass) > 1e-6
  ) {
    syncControlsFromScene(sceneState);
  }

  const tiltLabel = `${tilt}°`;
  const diskLabel = `${sceneState.diskInner.toFixed(1)} – ${sceneState.diskOuter.toFixed(1)}`;
  const rs = 2.0 * sceneState.mass;
  const rph = 3.0 * sceneState.mass;
  const risco = 6.0 * sceneState.mass;

  if (valMass) valMass.textContent = sceneState.mass.toFixed(2);
  if (valDiskRange) valDiskRange.textContent = diskLabel;
  if (valTilt) valTilt.textContent = tiltLabel;
  if (inputTilt) inputTilt.value = String(tilt);

  rsDisplay.textContent = rs.toFixed(2);
  rpDisplay.textContent = rph.toFixed(2);

  if (infoDisk) {
    infoDisk.textContent = `${sceneState.diskInner.toFixed(1)} / ${sceneState.diskOuter.toFixed(1)}`;
  }
  if (infoRs) infoRs.textContent = rs.toFixed(2);
  if (infoRph) infoRph.textContent = rph.toFixed(2);
  if (infoRisco) infoRisco.textContent = risco.toFixed(2);
  if (infoEscape) infoEscape.textContent = sceneState.escapeRadius.toFixed(1);
  if (infoCamDist) infoCamDist.textContent = sceneState.cameraDist.toFixed(1);
  if (infoCamOrbit) infoCamOrbit.textContent = `${camOrbit.toFixed(2)} rad`;
  if (infoDoppler) infoDoppler.textContent = toggleDoppler.checked ? 'on' : 'off';
  if (infoHorizon) infoHorizon.textContent = toggleHorizonOff.checked ? 'off' : 'on';

  uniforms.uMass.value = sceneState.mass;
  uniforms.uDiskInner.value = sceneState.diskInner;
  uniforms.uDiskOuter.value = sceneState.diskOuter;
  uniforms.uCameraDist.value = sceneState.cameraDist;
  uniforms.uEscapeRadius.value = sceneState.escapeRadius;

  camTilt = THREE.MathUtils.degToRad(tilt);
  uniforms.uCameraTilt.value = camTilt;
  markDirty();
}

function bindSliderNumber(slider, input, { parse = parseFloat, format } = {}) {
  if (!slider || !input) return;
  slider.addEventListener('input', () => {
    const v = parse(slider.value);
    input.value = format ? format(v) : String(v);
  });
  input.addEventListener('change', () => {
    let v = parse(input.value);
    if (!Number.isFinite(v)) {
      v = parse(slider.value);
    }
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    v = Math.min(max, Math.max(min, v));
    slider.value = String(v);
    input.value = format ? format(v) : String(v);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

bindSliderNumber(sliderMass, inputMass, {
  format: (v) => v.toFixed(2),
});
bindSliderNumber(sliderTilt, inputTilt, {
  parse: (x) => parseInt(x, 10),
  format: (v) => String(v),
});
bindSliderNumber(sliderDiskInner, inputDiskInner, {
  format: (v) => v.toFixed(1),
});
bindSliderNumber(sliderDiskOuter, inputDiskOuter, {
  format: (v) => v.toFixed(1),
});

sliderMass.addEventListener('input', updateHudValues);
sliderTilt.addEventListener('input', updateHudValues);

sliderDiskInner.addEventListener('input', () => {
  let inner = parseFloat(sliderDiskInner.value);
  let outer = parseFloat(sliderDiskOuter.value);
  if (inner >= outer - 0.2) {
    outer = inner + 0.2;
    sliderDiskOuter.value = String(outer);
    if (inputDiskOuter) inputDiskOuter.value = outer.toFixed(1);
  }
  if (inputDiskInner) inputDiskInner.value = inner.toFixed(1);
  updateHudValues();
});

sliderDiskOuter.addEventListener('input', () => {
  let outer = parseFloat(sliderDiskOuter.value);
  let inner = parseFloat(sliderDiskInner.value);
  if (outer <= inner + 0.2) {
    inner = outer - 0.2;
    sliderDiskInner.value = String(inner);
    if (inputDiskInner) inputDiskInner.value = inner.toFixed(1);
  }
  if (inputDiskOuter) inputDiskOuter.value = outer.toFixed(1);
  updateHudValues();
});

toggleDoppler.addEventListener('change', (e) => {
  uniforms.uDopplerEnabled.value = e.target.checked;
  if (infoDoppler) infoDoppler.textContent = e.target.checked ? 'on' : 'off';
  markDirty();
});

toggleHorizonOff.addEventListener('change', (e) => {
  uniforms.uHorizonEnabled.value = !e.target.checked;
  if (infoHorizon) infoHorizon.textContent = e.target.checked ? 'off' : 'on';
  markDirty();
});

function syncTiltReadout() {
  const tiltDeg = Math.round(THREE.MathUtils.radToDeg(camTilt));
  sliderTilt.value = String(tiltDeg);
  if (inputTilt) inputTilt.value = String(tiltDeg);
  if (valTilt) valTilt.textContent = `${tiltDeg}°`;
  if (infoCamOrbit) infoCamOrbit.textContent = `${camOrbit.toFixed(2)} rad`;
}

canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  prevMousePos.x = e.clientX;
  prevMousePos.y = e.clientY;
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - prevMousePos.x;
  const dy = e.clientY - prevMousePos.y;
  camOrbit += dx * 0.005;
  uniforms.uCameraOrbit.value = camOrbit;
  camTilt -= dy * 0.005;
  camTilt = Math.max(minTilt, Math.min(maxTilt, camTilt));
  uniforms.uCameraTilt.value = camTilt;
  syncTiltReadout();
  prevMousePos.x = e.clientX;
  prevMousePos.y = e.clientY;
  markDirty();
});

canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  isDragging = true;
  prevMousePos.x = e.touches[0].clientX;
  prevMousePos.y = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchend', () => {
  isDragging = false;
});

window.addEventListener('touchmove', (e) => {
  if (!isDragging || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - prevMousePos.x;
  const dy = e.touches[0].clientY - prevMousePos.y;
  camOrbit += dx * 0.008;
  uniforms.uCameraOrbit.value = camOrbit;
  camTilt -= dy * 0.008;
  camTilt = Math.max(minTilt, Math.min(maxTilt, camTilt));
  uniforms.uCameraTilt.value = camTilt;
  syncTiltReadout();
  prevMousePos.x = e.touches[0].clientX;
  prevMousePos.y = e.touches[0].clientY;
  markDirty();
}, { passive: true });

resButtons.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    resButtons.forEach((b) => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    renderScale = parseFloat(e.currentTarget.dataset.scale);
    resizeCanvas();
  });
});

function setActivePresetButton(name) {
  [presetReference, presetInclined, presetHorizonOff].forEach((b) =>
    b.classList.remove('active')
  );
  if (name === 'reference') presetReference.classList.add('active');
  if (name === 'inclined') presetInclined.classList.add('active');
  if (name === 'horizon-off') presetHorizonOff.classList.add('active');
}

function applyPreset(name) {
  setActivePresetButton(name);

  if (name === 'reference') {
    sliderMass.value = '1.0';
    sliderDiskInner.value = '6.0';
    sliderDiskOuter.value = '15.0';
    sliderTilt.value = '8';
    toggleDoppler.checked = true;
    toggleHorizonOff.checked = false;
  } else if (name === 'inclined') {
    sliderMass.value = '1.0';
    sliderDiskInner.value = '6.0';
    sliderDiskOuter.value = '15.0';
    sliderTilt.value = '32';
    toggleDoppler.checked = true;
    toggleHorizonOff.checked = false;
  } else if (name === 'horizon-off') {
    sliderMass.value = '1.0';
    sliderDiskInner.value = '6.0';
    sliderDiskOuter.value = '15.0';
    sliderTilt.value = '12';
    toggleDoppler.checked = true;
    toggleHorizonOff.checked = true;
  }

  if (inputMass) inputMass.value = parseFloat(sliderMass.value).toFixed(2);
  if (inputDiskInner) inputDiskInner.value = parseFloat(sliderDiskInner.value).toFixed(1);
  if (inputDiskOuter) inputDiskOuter.value = parseFloat(sliderDiskOuter.value).toFixed(1);
  if (inputTilt) inputTilt.value = sliderTilt.value;

  uniforms.uDopplerEnabled.value = toggleDoppler.checked;
  uniforms.uHorizonEnabled.value = !toggleHorizonOff.checked;
  camOrbit = 0.0;
  uniforms.uCameraOrbit.value = camOrbit;
  updateHudValues();
}

presetReference.addEventListener('click', () => applyPreset('reference'));
presetInclined.addEventListener('click', () => applyPreset('inclined'));
presetHorizonOff.addEventListener('click', () => applyPreset('horizon-off'));

function setPaused(next) {
  isPaused = next;
  if (isPaused) {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    btnPlayPause.title = 'Play simulation';
    if (playPauseLabel) playPauseLabel.textContent = 'Play';
    if (pauseBadge) pauseBadge.hidden = false;
  } else {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    btnPlayPause.title = 'Pause simulation';
    if (playPauseLabel) playPauseLabel.textContent = 'Pause';
    if (pauseBadge) pauseBadge.hidden = true;
    markDirty();
  }
}

btnPlayPause.addEventListener('click', () => setPaused(!isPaused));

btnReset.addEventListener('click', () => {
  let activePreset = 'reference';
  if (presetInclined.classList.contains('active')) activePreset = 'inclined';
  if (presetHorizonOff.classList.contains('active')) activePreset = 'horizon-off';
  applyPreset(activePreset);
});

function buildExportMetadata() {
  return {
    modelId: MODEL_ID,
    appVersion: APP_VERSION,
    physical: {
      mass: uniforms.uMass.value,
      diskInner: uniforms.uDiskInner.value,
      diskOuter: uniforms.uDiskOuter.value,
      dopplerEnabled: uniforms.uDopplerEnabled.value,
      horizonEnabled: uniforms.uHorizonEnabled.value,
      cameraDistance: uniforms.uCameraDist.value,
      cameraTiltRad: uniforms.uCameraTilt.value,
      cameraOrbitRad: uniforms.uCameraOrbit.value,
      escapeRadius: uniforms.uEscapeRadius.value,
      maxSteps: DEFAULT_MAX_STEPS,
      integrator: 'RK4',
      acceleration: 'a = -3 M h^2 r_hat / r^4 (Cartesian Schwarzschild spatial)',
    },
    presentation: {
      time: uniforms.uTime.value,
      renderScale,
      resolution: {
        width: uniforms.uResolution.value.x,
        height: uniforms.uResolution.value.y,
      },
      artisticEmissivityNoise: true,
      blackbodyChromaticity: 'Tanner Helland 1000K-40000K',
      bolometricWeight: '(T_obs / T_ref)^4 with T_ref = 6000 K',
    },
    notes: [
      'Spatial Cartesian ODE; not a photon four-momentum integrator.',
      'Disk g-factor uses circular Schwarzschild orbits; not full radiative transfer.',
      'Camera rays use Euclidean unit directions at finite r_cam (O(M/r_cam) sky error).',
    ],
  };
}

function downloadBlob(filename, blob) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

btnExport.addEventListener('click', () => {
  try {
    renderer.render(scene, camera);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `schwarzschild-raytrace-${timestamp}`;
    const dataURL = canvas.toDataURL('image/png');
    if (!dataURL || !dataURL.startsWith('data:image/png')) {
      throw new Error('PNG encode failed');
    }
    const pngLink = document.createElement('a');
    pngLink.download = `${base}.png`;
    pngLink.href = dataURL;
    document.body.appendChild(pngLink);
    pngLink.click();
    document.body.removeChild(pngLink);

    const meta = buildExportMetadata();
    downloadBlob(
      `${base}.json`,
      new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' })
    );
    showToast('Snapshot PNG and JSON sidecar downloaded.', { tone: 'success' });
  } catch (err) {
    console.error(err);
    showToast('Export failed. Try again or use a different browser.', {
      tone: 'danger',
    });
  }
});

if (infoModelId) infoModelId.textContent = MODEL_ID;
if (infoMaxSteps) infoMaxSteps.textContent = String(DEFAULT_MAX_STEPS);

initTheme();
initTour({ helpButton: btnHelp });

resizeCanvas();
window.addEventListener('resize', resizeCanvas);
applyPreset('reference');

function animate() {
  requestAnimationFrame(animate);

  if (!isPaused) {
    accumulatedTime += clock.getDelta();
    uniforms.uTime.value = accumulatedTime;
    needsRender = true;
  } else {
    clock.getDelta();
  }

  if (needsRender) {
    renderer.render(scene, camera);
    needsRender = false;
  }

  frameCount++;
  const time = performance.now();
  if (time >= lastFpsUpdate + 1000) {
    const fps = Math.round((frameCount * 1000) / (time - lastFpsUpdate));
    fpsCounter.textContent = String(fps);
    frameCount = 0;
    lastFpsUpdate = time;
  }
}

clock.start();
animate();
