import { storageGet, storageSet } from './storage.js';

const KEY_DONE = 'bho-tour-done';
const KEY_HINT_CAMERA = 'bho-hint-camera';

const STEPS = [
  {
    id: 'welcome-viewport',
    target: 'viewport',
    title: 'Welcome to the observatory',
    body: 'This image visualizes light bending around a Schwarzschild black hole using a documented Cartesian ray model—not a Kerr spacetime and not full radiative transfer.',
    primary: 'Next',
  },
  {
    id: 'camera',
    target: 'viewport',
    title: 'Explore the black hole',
    body: 'Drag on the viewport to orbit and change inclination. On touch devices, use a single-finger drag.',
    primary: 'Next',
    awaitDrag: true,
  },
  {
    id: 'mass',
    target: 'control-mass',
    title: 'Adjust the simulation',
    body: 'Mass M sets the geometric scale. The horizon (2M), photon sphere (3M), and ISCO (6M) all move with it—the same M used in the ray integrator.',
    primary: 'Next',
  },
  {
    id: 'disk',
    target: 'control-disk',
    title: 'Explore the accretion disk',
    body: 'The thin disk starts at or outside the ISCO. Circular-orbit Doppler uses a consistent frequency factor; swirl texture is artistic emissivity, not full GR transfer.',
    primary: 'Next',
  },
  {
    id: 'presets',
    target: 'presets',
    title: 'Try a preset',
    body: 'Reference, Inclined, and Horizon off load validated configurations. Horizon off disables the capture cutoff for visualization—it is not a naked-singularity metric.',
    primary: 'Next',
  },
  {
    id: 'science',
    target: 'science-panel',
    title: 'Understand the science panel',
    body: 'Selected parameters, calculated radii (2M, 3M, 6M), and render diagnostics (FPS, resolution) are listed separately so telemetry is never mistaken for a physical measurement.',
    primary: 'Next',
  },
  {
    id: 'export',
    target: 'export',
    title: 'Save your results',
    body: 'Snapshot downloads a PNG of the framebuffer and a JSON sidecar with the physical parameters needed to reproduce the run.',
    primary: 'Next',
  },
  {
    id: 'theme',
    target: 'theme',
    title: 'Personalize the experience',
    body: 'Choose System, Light, or Dark for the interface chrome. Theme changes never alter the ray trajectories or scientific output.',
    primary: 'Next',
  },
  {
    id: 'done',
    target: null,
    title: 'Ready to explore',
    body: 'Experiment freely. Restart this tour anytime from Help.',
    primary: 'Finish',
  },
];

let state = {
  active: false,
  index: 0,
  lastFocus: null,
  dragArmed: false,
  dragMoved: false,
};

let els = {};
let onDragAdvance = null;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ensureDom() {
  if (els.root) return;

  const root = document.createElement('div');
  root.id = 'tour-root';
  root.className = 'tour-root';
  root.hidden = true;
  root.innerHTML = `
    <div class="tour-spotlight" data-tour-spotlight hidden></div>
    <div class="tour-popover" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabindex="-1">
      <div class="tour-arrow" data-tour-arrow aria-hidden="true"></div>
      <div class="tour-popover-inner">
        <p class="tour-step-label font-mono" data-tour-step-label></p>
        <h2 id="tour-title" class="tour-title" data-tour-title></h2>
        <p class="tour-body" data-tour-body></p>
        <div class="tour-actions">
          <button type="button" class="btn btn-ghost" data-tour-skip>Skip</button>
          <div class="tour-actions-right">
            <button type="button" class="btn btn-secondary" data-tour-back>Back</button>
            <button type="button" class="btn btn-primary" data-tour-primary>Next</button>
          </div>
        </div>
      </div>
    </div>
    <div class="tour-welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" hidden>
      <div class="tour-welcome-card">
        <button type="button" class="icon-btn tour-welcome-close" data-welcome-close aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <h2 id="welcome-title">Black Hole Observatory</h2>
        <p>Interactive Schwarzschild ray tracing—explore lensing, disk parameters, and reproducible snapshots.</p>
        <div class="tour-welcome-actions">
          <button type="button" class="btn btn-primary" data-welcome-start>Start guided tour</button>
          <button type="button" class="btn btn-secondary" data-welcome-explore>Explore on my own</button>
        </div>
      </div>
    </div>
    <div class="tour-hint" role="status" hidden>
      <p data-hint-body></p>
      <button type="button" class="btn btn-ghost btn-sm" data-hint-dismiss>Got it</button>
    </div>
  `;
  document.body.appendChild(root);

  els = {
    root,
    spotlight: root.querySelector('[data-tour-spotlight]'),
    popover: root.querySelector('.tour-popover'),
    arrow: root.querySelector('[data-tour-arrow]'),
    stepLabel: root.querySelector('[data-tour-step-label]'),
    title: root.querySelector('[data-tour-title]'),
    body: root.querySelector('[data-tour-body]'),
    skip: root.querySelector('[data-tour-skip]'),
    back: root.querySelector('[data-tour-back]'),
    primary: root.querySelector('[data-tour-primary]'),
    welcome: root.querySelector('.tour-welcome'),
    welcomeStart: root.querySelector('[data-welcome-start]'),
    welcomeExplore: root.querySelector('[data-welcome-explore]'),
    welcomeClose: root.querySelector('[data-welcome-close]'),
    hint: root.querySelector('.tour-hint'),
    hintBody: root.querySelector('[data-hint-body]'),
    hintDismiss: root.querySelector('[data-hint-dismiss]'),
  };

  els.skip.addEventListener('click', endTour);
  els.back.addEventListener('click', () => goTo(state.index - 1));
  els.primary.addEventListener('click', () => {
    if (state.index >= STEPS.length - 1) endTour();
    else goTo(state.index + 1);
  });
  els.welcomeStart.addEventListener('click', () => {
    hideWelcome();
    startTour();
  });
  els.welcomeExplore.addEventListener('click', () => {
    storageSet(KEY_DONE, 'explore');
    hideWelcome();
    maybeShowCameraHint();
  });
  els.welcomeClose.addEventListener('click', () => {
    storageSet(KEY_DONE, 'dismissed');
    hideWelcome();
    maybeShowCameraHint();
  });
  els.hintDismiss.addEventListener('click', () => {
    storageSet(KEY_HINT_CAMERA, '1');
    els.hint.hidden = true;
  });

  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
}

function onKeyDown(e) {
  if (!state.active && els.welcome && !els.welcome.hidden) {
    if (e.key === 'Escape') {
      storageSet(KEY_DONE, 'dismissed');
      hideWelcome();
      maybeShowCameraHint();
    }
    return;
  }
  if (!state.active) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    endTour();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    els.primary.click();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (state.index > 0) goTo(state.index - 1);
  }
}

function getTargetEl(name) {
  if (!name) return null;
  return document.querySelector(`[data-tour="${name}"]`);
}

function clearHighlight() {
  document.querySelectorAll('.tour-target-active').forEach((el) => {
    el.classList.remove('tour-target-active');
  });
}

function positionPopover(target) {
  const pop = els.popover;
  const arrow = els.arrow;
  const pad = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!target) {
    els.spotlight.hidden = true;
    pop.style.left = `${Math.max(pad, (vw - 360) / 2)}px`;
    pop.style.top = `${Math.max(pad, vh * 0.28)}px`;
    arrow.dataset.side = 'none';
    return;
  }

  target.classList.add('tour-target-active');
  target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });

  const rect = target.getBoundingClientRect();
  els.spotlight.hidden = false;
  els.spotlight.style.left = `${rect.left - 6}px`;
  els.spotlight.style.top = `${rect.top - 6}px`;
  els.spotlight.style.width = `${rect.width + 12}px`;
  els.spotlight.style.height = `${rect.height + 12}px`;

  const popW = Math.min(360, vw - pad * 2);
  pop.style.width = `${popW}px`;
  // Measure after width set
  const ph = pop.offsetHeight || 200;

  let left = rect.left + rect.width / 2 - popW / 2;
  left = Math.min(Math.max(pad, left), vw - popW - pad);

  // Prefer placing the popover in the side rail / outside a full-bleed viewport target
  // so the canvas never covers the dialog actions.
  let top = rect.bottom + 14;
  let side = 'top';
  const preferSide = rect.width > vw * 0.45 || rect.height > vh * 0.45;

  if (preferSide) {
    side = 'left';
    left = Math.min(vw - popW - pad, rect.right + 14);
    if (left < pad || left + popW > vw - pad) {
      left = Math.max(pad, rect.left - popW - 14);
      side = 'right';
    }
    top = Math.min(Math.max(pad, rect.top + 12), vh - ph - pad);
  } else if (top + ph > vh - pad) {
    top = rect.top - ph - 14;
    side = 'bottom';
    if (top < pad) {
      top = Math.min(vh - ph - pad, Math.max(pad, rect.top));
      side = 'left';
      left = rect.right + 14;
      if (left + popW > vw - pad) {
        left = rect.left - popW - 14;
        side = 'right';
      }
      left = Math.min(Math.max(pad, left), vw - popW - pad);
    }
  }

  pop.style.left = `${left}px`;
  pop.style.top = `${Math.max(pad, top)}px`;
  arrow.dataset.side = side;
}

function reposition() {
  if (!state.active) return;
  const step = STEPS[state.index];
  clearHighlight();
  positionPopover(getTargetEl(step?.target));
}

function bindDragAdvance(enable) {
  const canvas = document.getElementById('raytracer-canvas');
  if (!canvas) return;

  if (onDragAdvance) {
    canvas.removeEventListener('pointerdown', onDragAdvance.down);
    window.removeEventListener('pointermove', onDragAdvance.move);
    window.removeEventListener('pointerup', onDragAdvance.up);
    onDragAdvance = null;
  }
  if (!enable) return;

  state.dragArmed = false;
  state.dragMoved = false;
  const down = (e) => {
    if (!state.active || !STEPS[state.index]?.awaitDrag) return;
    state.dragArmed = true;
    state.dragMoved = false;
    state._dx0 = e.clientX;
    state._dy0 = e.clientY;
  };
  const move = (e) => {
    if (!state.dragArmed) return;
    const dx = e.clientX - state._dx0;
    const dy = e.clientY - state._dy0;
    if (dx * dx + dy * dy > 36) state.dragMoved = true;
  };
  const up = () => {
    if (state.dragArmed && state.dragMoved && STEPS[state.index]?.awaitDrag) {
      goTo(state.index + 1);
    }
    state.dragArmed = false;
  };
  onDragAdvance = { down, move, up };
  canvas.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function renderStep() {
  const step = STEPS[state.index];
  if (!step) return;
  els.root.hidden = false;
  els.popover.hidden = false;
  els.welcome.hidden = true;
  els.stepLabel.textContent = `Step ${state.index + 1} of ${STEPS.length}`;
  els.title.textContent = step.title;
  els.body.textContent = step.body;
  els.primary.textContent = step.primary;
  els.back.disabled = state.index === 0;
  els.back.hidden = state.index === 0;
  clearHighlight();
  positionPopover(getTargetEl(step.target));
  bindDragAdvance(Boolean(step.awaitDrag));
  els.popover.focus();
}

function goTo(index) {
  if (index < 0 || index >= STEPS.length) return;
  state.index = index;
  renderStep();
}

function endTour() {
  state.active = false;
  bindDragAdvance(false);
  clearHighlight();
  els.popover.hidden = true;
  els.spotlight.hidden = true;
  storageSet(KEY_DONE, 'completed');
  if (state.lastFocus && typeof state.lastFocus.focus === 'function') {
    state.lastFocus.focus();
  }
  maybeShowCameraHint();
  if (els.hint?.hidden !== false) {
    els.root.hidden = true;
  }
}

export function startTour() {
  ensureDom();
  state.lastFocus = document.activeElement;
  state.active = true;
  state.index = 0;
  els.welcome.hidden = true;
  renderStep();
}

function hideWelcome() {
  if (els.welcome) els.welcome.hidden = true;
  if (els.root && !state.active) els.root.hidden = true;
}

function showWelcome() {
  ensureDom();
  els.root.hidden = false;
  els.popover.hidden = true;
  els.spotlight.hidden = true;
  els.welcome.hidden = false;
  els.welcomeStart.focus();
}

function maybeShowCameraHint() {
  if (storageGet(KEY_HINT_CAMERA)) return;
  ensureDom();
  els.hintBody.textContent =
    'Tip: drag the viewport to orbit the camera. Restart the full tour anytime from Help.';
  els.hint.hidden = false;
  els.root.hidden = false;
}

export function initTour({ helpButton } = {}) {
  ensureDom();

  if (helpButton) {
    helpButton.addEventListener('click', () => startTour());
  }

  if (!storageGet(KEY_DONE)) {
    showWelcome();
  }
}
