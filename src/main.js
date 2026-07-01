import * as THREE from 'three';
import { vertexShader, fragmentShader } from './shader.js';
import './style.css';

// DOM ELEMENTS
const canvas = document.getElementById('raytracer-canvas');
const container = document.getElementById('canvas-container');
const fpsCounter = document.getElementById('fps-counter');
const rsDisplay = document.getElementById('rs-display');
const rpDisplay = document.getElementById('rp-display');

// Slider inputs
const sliderMass = document.getElementById('slider-mass');
const sliderDiskInner = document.getElementById('slider-disk-inner');
const sliderDiskOuter = document.getElementById('slider-disk-outer');
const sliderTilt = document.getElementById('slider-tilt');

// Slider value readouts
const valMass = document.getElementById('val-mass');
const valDiskRange = document.getElementById('val-disk-range');
const valTilt = document.getElementById('val-tilt');

// Toggles & Actions
const toggleDoppler = document.getElementById('toggle-doppler');
const toggleBare = document.getElementById('toggle-bare');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnReset = document.getElementById('btn-reset');
const btnExport = document.getElementById('btn-export');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');

// Presets
const presetInterstellar = document.getElementById('preset-interstellar');
const presetExtreme = document.getElementById('preset-extreme');
const presetBare = document.getElementById('preset-bare');

// Resolution Buttons
const resButtons = document.querySelectorAll('.res-btn');

// STATE VARIABLE MANAGEMENT
let isPaused = false;
let clock = new THREE.Clock();
let accumulatedTime = 0;
let frameCount = 0;
let lastFpsUpdate = 0;
let renderScale = 0.8; // Default medium quality

// Camera State (Radiens for Tilt and Orbit)
let camOrbit = 0.0;
let camTilt = 0.14; // ~8 degrees
const minTilt = -1.48; // -85 degrees
const maxTilt = 1.48;  // 85 degrees

// Drag Controls State
let isDragging = false;
let prevMousePos = { x: 0, y: 0 };

// THREE.JS SETUP
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: false,
  alpha: false,
  preserveDrawingBuffer: true // Required for snapshot downloads
});

// SHADER UNIFORMS
const uniforms = {
  uResolution: { value: new THREE.Vector2() },
  uTime: { value: 0.0 },
  uMass: { value: parseFloat(sliderMass.value) },
  uDiskInner: { value: parseFloat(sliderDiskInner.value) },
  uDiskOuter: { value: parseFloat(sliderDiskOuter.value) },
  uCameraTilt: { value: camTilt },
  uCameraOrbit: { value: camOrbit },
  uCameraDist: { value: 16.0 },
  uDopplerEnabled: { value: toggleDoppler.checked },
  uBareSingularity: { value: toggleBare.checked }
};

// Create a full screen quad for ray-marching
const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms,
  depthWrite: false,
  depthTest: false
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// RESIZE HANDLER
function resizeCanvas() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  // Calculate scaled resolution
  const scaledWidth = Math.floor(width * renderScale);
  const scaledHeight = Math.floor(height * renderScale);
  
  // Resize renderer size without changing display layout
  renderer.setSize(scaledWidth, scaledHeight, false);
  
  // Update canvas stylesheet layout size
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  
  uniforms.uResolution.value.set(scaledWidth, scaledHeight);
}

// INTIAL RESIZE
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// HUD UPDATER
function updateHudValues() {
  const mass = parseFloat(sliderMass.value);
  const inner = parseFloat(sliderDiskInner.value);
  const outer = parseFloat(sliderDiskOuter.value);
  const tilt = parseInt(sliderTilt.value);

  // Update displays
  valMass.textContent = mass.toFixed(2);
  valDiskRange.textContent = `${inner.toFixed(1)} - ${outer.toFixed(1)}`;
  valTilt.textContent = `${tilt}°`;

  rsDisplay.textContent = `${(2.0 * mass).toFixed(1)}M`;
  rpDisplay.textContent = `${(3.0 * mass).toFixed(1)}M`;

  // Update uniforms
  uniforms.uMass.value = mass;
  uniforms.uDiskInner.value = inner;
  uniforms.uDiskOuter.value = outer;
  
  camTilt = THREE.MathUtils.degToRad(tilt);
  uniforms.uCameraTilt.value = camTilt;
}

// BIND SLIDERS TO EVENTS
sliderMass.addEventListener('input', updateHudValues);
sliderTilt.addEventListener('input', updateHudValues);

sliderDiskInner.addEventListener('input', (e) => {
  let inner = parseFloat(e.target.value);
  let outer = parseFloat(sliderDiskOuter.value);
  if (inner >= outer - 0.2) {
    outer = inner + 0.2;
    sliderDiskOuter.value = outer;
  }
  updateHudValues();
});

sliderDiskOuter.addEventListener('input', (e) => {
  let outer = parseFloat(e.target.value);
  let inner = parseFloat(sliderDiskInner.value);
  if (outer <= inner + 0.2) {
    inner = outer - 0.2;
    sliderDiskInner.value = inner;
  }
  updateHudValues();
});

// TOGGLES
toggleDoppler.addEventListener('change', (e) => {
  uniforms.uDopplerEnabled.value = e.target.checked;
});

toggleBare.addEventListener('change', (e) => {
  uniforms.uBareSingularity.value = e.target.checked;
});

// CAMERA DRAG CONTROLS
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
  
  // Orbit around black hole (azimuthal)
  camOrbit += dx * 0.005;
  uniforms.uCameraOrbit.value = camOrbit;
  
  // Tilt camera (inclination)
  camTilt -= dy * 0.005;
  camTilt = Math.max(minTilt, Math.min(maxTilt, camTilt));
  uniforms.uCameraTilt.value = camTilt;

  // Sync tilt to the slider
  const tiltDeg = Math.round(THREE.MathUtils.radToDeg(camTilt));
  sliderTilt.value = tiltDeg;
  valTilt.textContent = `${tiltDeg}°`;
  
  prevMousePos.x = e.clientX;
  prevMousePos.y = e.clientY;
});

// Mobile touch drag support
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  isDragging = true;
  prevMousePos.x = e.touches[0].clientX;
  prevMousePos.y = e.touches[0].clientY;
});

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

  const tiltDeg = Math.round(THREE.MathUtils.radToDeg(camTilt));
  sliderTilt.value = tiltDeg;
  valTilt.textContent = `${tiltDeg}°`;
  
  prevMousePos.x = e.touches[0].clientX;
  prevMousePos.y = e.touches[0].clientY;
});

// RESOLUTION SWITCHERS
resButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    resButtons.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderScale = parseFloat(e.target.dataset.scale);
    resizeCanvas();
  });
});

// PRESET CONFIGURATOR
function applyPreset(name) {
  // Update UI buttons
  [presetInterstellar, presetExtreme, presetBare].forEach(b => b.classList.remove('active'));
  
  if (name === 'interstellar') {
    presetInterstellar.classList.add('active');
    sliderMass.value = 1.0;
    sliderDiskInner.value = 3.0;
    sliderDiskOuter.value = 9.0;
    sliderTilt.value = 8;
    toggleDoppler.checked = true;
    toggleBare.checked = false;
  } else if (name === 'extreme') {
    presetExtreme.classList.add('active');
    sliderMass.value = 1.6;
    sliderDiskInner.value = 4.2;
    sliderDiskOuter.value = 7.5;
    sliderTilt.value = 32;
    toggleDoppler.checked = true;
    toggleBare.checked = false;
  } else if (name === 'bare') {
    presetBare.classList.add('active');
    sliderMass.value = 0.8;
    sliderDiskInner.value = 2.2;
    sliderDiskOuter.value = 6.0;
    sliderTilt.value = 12;
    toggleDoppler.checked = true;
    toggleBare.checked = true;
  }
  
  // Update uniforms
  uniforms.uDopplerEnabled.value = toggleDoppler.checked;
  uniforms.uBareSingularity.value = toggleBare.checked;
  
  updateHudValues();
}

presetInterstellar.addEventListener('click', () => applyPreset('interstellar'));
presetExtreme.addEventListener('click', () => applyPreset('extreme'));
presetBare.addEventListener('click', () => applyPreset('bare'));

// PLAY / PAUSE BUTTON
btnPlayPause.addEventListener('click', () => {
  isPaused = !isPaused;
  if (isPaused) {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    btnPlayPause.title = "Play Simulation";
  } else {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    btnPlayPause.title = "Pause Simulation";
  }
});

// RESET VIEW BUTTON
btnReset.addEventListener('click', () => {
  camOrbit = 0.0;
  uniforms.uCameraOrbit.value = camOrbit;
  
  // Default values based on current active preset
  let activePreset = 'interstellar';
  if (presetExtreme.classList.contains('active')) activePreset = 'extreme';
  if (presetBare.classList.contains('active')) activePreset = 'bare';
  applyPreset(activePreset);
});

// SNAPSHOT EXPORT UTILITY
btnExport.addEventListener('click', () => {
  // Render one frame to ensure drawing buffer matches exactly
  renderer.render(scene, camera);
  
  // Get image URL
  const dataURL = canvas.toDataURL('image/png');
  
  // Create virtual download element
  const link = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  link.download = `schwarzschild-raytrace-${timestamp}.png`;
  link.href = dataURL;
  
  // Trigger download
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// EDUCATIONAL ACCORDIONS LOGIC
const accordionItems = document.querySelectorAll('.accordion-item');
accordionItems.forEach(item => {
  const header = item.querySelector('.accordion-header');
  header.addEventListener('click', () => {
    const isActive = item.classList.contains('active');
    
    // Collapse all items
    accordionItems.forEach(i => i.classList.remove('active'));
    
    // Toggle active state
    if (!isActive) {
      item.classList.add('active');
    }
  });
});

// FIRST RUN HUD INITIALIZATION
updateHudValues();

// ANIMATION RENDER LOOP
function animate() {
  requestAnimationFrame(animate);
  
  // Update time for swirling noise
  if (!isPaused) {
    accumulatedTime += clock.getDelta();
    uniforms.uTime.value = accumulatedTime;
  } else {
    // Keep clock updating to avoid massive jump on resume
    clock.getDelta();
  }
  
  // Render
  renderer.render(scene, camera);
  
  // FPS calculation
  frameCount++;
  const time = performance.now();
  if (time >= lastFpsUpdate + 1000) {
    fpsCounter.textContent = Math.round((frameCount * 1000) / (time - lastFpsUpdate));
    frameCount = 0;
    lastFpsUpdate = time;
  }
}

// START LOOP
clock.start();
animate();
