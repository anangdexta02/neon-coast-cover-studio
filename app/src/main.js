// main.js — Neon Coast — Cover Studio: state, wiring, history, export.
//
// The studio keeps one `state` object (see defaultState). Every edit goes
// through commit() so undo/redo stay consistent; sliders and text fields
// commit once per drag/edit, not per input event. Rendering is a pure
// function of state (render.js), scheduled through requestAnimationFrame.
//
// URL scenes:
//   ?shot=cover[&layout=<id>][&grade=<id>]  bare cover, full viewport
//   ?shot=editor[&layout=<id>][&grade=<id>] the studio, pre-set
// Both wait for fonts (raced against 3.5 s) and the sample photos, render,
// then set window.__neonCoastReady = true for the screenshot harness.

import { GRADES } from './grades.js';
import { LAYOUTS, LAYOUT_ORDER } from './layouts.js';
import { renderCover, panelPixelRects } from './render.js';

const SAMPLES = [
  'samples/beach-tower.jpg',
  'samples/friends-neon.jpg',
  'samples/man-pier.jpg',
  'samples/man-rooftop.jpg',
  'samples/woman-boat.jpg',
  'samples/woman-car.jpg',
];
const LS_KEY = 'neon-coast-state-v1';
const ASPECTS = { '1:1': [1080, 1080], '4:5': [1080, 1350], '9:16': [1080, 1920], '16:9': [1080, 608] };
const HISTORY_CAP = 60;

const $ = (id) => document.getElementById(id);
const canvas = $('cover');
const ctx = canvas.getContext('2d');

// ---------------------------------------------------------------- state

function defaultPanel(src, grade = null) {
  return { src, grade, zoom: 1, rot: 0, flip: false, dx: 0, dy: 0 };
}

function defaultState() {
  return {
    layout: 'nine',
    aspect: '1:1',
    grade: 'vice',
    ink: 0.35,
    grain: 0.3,
    vignette: 0.45,
    halftone: 0,
    frame: true,
    banner: 'A SUNSET SHORES ORIGINAL',
    title: 'NEON COAST',
    subtitle: 'sunset strip stories',
    titleFill: 'sunset',
    titleSize: 1,
    placement: 'bottom',
    stars: 5,
    ribbon: true,
    ribbonText: 'SPECIAL EDITION',
    badge18: true,
    selected: 4,
    panels: [
      defaultPanel(SAMPLES[0]),
      defaultPanel(SAMPLES[1]),
      defaultPanel(SAMPLES[2]),
      defaultPanel(SAMPLES[3]),
      defaultPanel(SAMPLES[4]),
      defaultPanel(SAMPLES[5]),
      defaultPanel(SAMPLES[1]),
      defaultPanel(SAMPLES[2], 'golden'),
      defaultPanel(SAMPLES[0], 'tealheat'),
    ],
  };
}

let state = defaultState();
let showSelection = true;

// Image registry: panel.src is a key — a sample path or an upload id.
const images = new Map();
let uploadCount = 0;
let armedSrc = null;

function loadIntoRegistry(key, url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { images.set(key, img); resolve(true); };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

// ---------------------------------------------------------------- scenes

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const isCoverShot = shot === 'cover';
if (isCoverShot) {
  document.body.classList.add('shot-cover');
  showSelection = false;
  state = defaultState();
}
if (params.get('layout') && LAYOUTS[params.get('layout')]) state.layout = params.get('layout');
if (params.get('grade') && GRADES.some((g) => g.id === params.get('grade'))) state.grade = params.get('grade');

if (!isCoverShot) {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved && Array.isArray(saved.panels) && saved.panels.length >= 9 && !params.get('layout')) {
      state = Object.assign(defaultState(), saved);
    }
  } catch { /* a corrupt save just means the default cover */ }
}

// ---------------------------------------------------------------- history

const undoStack = [];
const redoStack = [];
const clone = (s) => JSON.parse(JSON.stringify(s));

function pushUndo(snapshot) {
  undoStack.push(snapshot);
  if (undoStack.length > HISTORY_CAP) undoStack.shift();
  redoStack.length = 0;
}

function commit(mutator) {
  pushUndo(clone(state));
  mutator(state);
  afterChange();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(clone(state));
  state = undoStack.pop();
  afterChange();
}

function redo() {
  if (!redoStack.length) return;
  pushUndoKeepRedo(clone(state));
  state = redoStack.pop();
  afterChange();
}

function pushUndoKeepRedo(snapshot) {
  undoStack.push(snapshot);
  if (undoStack.length > HISTORY_CAP) undoStack.shift();
}

// Transient edits (slider drags, text typing): capture a snapshot when the
// edit begins; on 'change', push it as a single undo step if it differs.
let transientSnapshot = null;
function beginTransient() {
  if (!transientSnapshot) transientSnapshot = clone(state);
}
function endTransient() {
  if (!transientSnapshot) return;
  if (JSON.stringify(transientSnapshot) !== JSON.stringify(state)) {
    pushUndo(transientSnapshot);
  }
  transientSnapshot = null;
  afterChange();
}

// ---------------------------------------------------------------- render

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderCover(ctx, canvas.width, canvas.height, { ...state, showSelection }, images);
  });
}

function sizeCanvasToAspect() {
  if (isCoverShot) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  } else {
    const [w, h] = ASPECTS[state.aspect] || ASPECTS['1:1'];
    canvas.width = w;
    canvas.height = h;
  }
}

function selectedPanel() {
  return state.panels[state.selected] || state.panels[0];
}

function updateSelLabel() {
  const p = selectedPanel();
  const name = p && p.src ? p.src.split('/').pop() : 'empty';
  $('sel-label').textContent = `Panel ${state.selected + 1} — ${name}`;
}

function updateHistoryButtons() {
  $('undo-btn').disabled = undoStack.length === 0;
  $('redo-btn').disabled = redoStack.length === 0;
}

function afterChange() {
  syncControls();
  updateSelLabel();
  updateHistoryButtons();
  render();
  persist();
}

function persist() {
  if (isCoverShot) return;
  const sampleOnly = state.panels.every((p) => !p.src || SAMPLES.includes(p.src));
  try {
    if (sampleOnly) localStorage.setItem(LS_KEY, JSON.stringify(state));
    else localStorage.removeItem(LS_KEY);
  } catch { /* storage may be unavailable; the studio still works */ }
}

// ---------------------------------------------------------------- controls

function buildGrids() {
  const layoutGrid = $('layout-grid');
  for (const id of LAYOUT_ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = LAYOUTS[id].name;
    b.dataset.layout = id;
    b.addEventListener('click', () => commit((s) => {
      s.layout = id;
      if (s.selected >= LAYOUTS[id].panels.length) s.selected = 0;
    }));
    layoutGrid.appendChild(b);
  }
  const gradeGrid = $('grade-grid');
  for (const g of GRADES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = g.name;
    b.dataset.grade = g.id;
    b.addEventListener('click', () => commit((s) => { s.grade = g.id; }));
    gradeGrid.appendChild(b);
  }
  const panelGrade = $('panel-grade-select');
  const globalOpt = document.createElement('option');
  globalOpt.value = '';
  globalOpt.textContent = 'Use global grade';
  panelGrade.appendChild(globalOpt);
  for (const g of GRADES) {
    const o = document.createElement('option');
    o.value = g.id;
    o.textContent = g.name;
    panelGrade.appendChild(o);
  }
}

function syncControls() {
  document.querySelectorAll('#layout-grid button').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  });
  document.querySelectorAll('#grade-grid button').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === state.grade);
  });
  $('ink-range').value = Math.round(state.ink * 100);
  $('grain-range').value = Math.round(state.grain * 100);
  $('vignette-range').value = Math.round(state.vignette * 100);
  $('halftone-range').value = Math.round(state.halftone * 100);
  $('frame-toggle').checked = state.frame;
  $('banner-input').value = state.banner;
  $('title-input').value = state.title;
  $('subtitle-input').value = state.subtitle;
  $('title-fill-select').value = state.titleFill;
  $('title-size-range').value = Math.round(state.titleSize * 100);
  $('placement-select').value = state.placement;
  document.querySelectorAll('.star-btn').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.value) <= state.stars);
  });
  $('ribbon-toggle').checked = state.ribbon;
  $('ribbon-text-input').value = state.ribbonText;
  $('badge-toggle').checked = state.badge18;
  const p = selectedPanel();
  if (p) {
    $('panel-grade-select').value = p.grade || '';
    $('panel-zoom-range').value = Math.round((p.zoom || 1) * 100);
    $('panel-rot-range').value = Math.round(p.rot || 0);
  }
  $('aspect-select').value = state.aspect;
}

// Range sliders: live-update on input, one history step per drag.
function wireRange(id, apply) {
  const el = $(id);
  el.addEventListener('pointerdown', beginTransient);
  el.addEventListener('focus', beginTransient);
  el.addEventListener('input', () => { apply(state, Number(el.value)); render(); });
  el.addEventListener('change', endTransient);
}

// Text fields: live-update on input, one history step per edit.
function wireText(id, apply) {
  const el = $(id);
  el.addEventListener('focus', beginTransient);
  el.addEventListener('input', () => { apply(state, el.value); render(); });
  el.addEventListener('change', endTransient);
}

function wireControls() {
  wireRange('ink-range', (s, v) => { s.ink = v / 100; });
  wireRange('grain-range', (s, v) => { s.grain = v / 100; });
  wireRange('vignette-range', (s, v) => { s.vignette = v / 100; });
  wireRange('halftone-range', (s, v) => { s.halftone = v / 100; });
  wireRange('title-size-range', (s, v) => { s.titleSize = v / 100; });
  wireRange('panel-zoom-range', (s, v) => { selectedPanel().zoom = v / 100; });
  wireRange('panel-rot-range', (s, v) => { selectedPanel().rot = v; });

  wireText('banner-input', (s, v) => { s.banner = v; });
  wireText('title-input', (s, v) => { s.title = v; });
  wireText('subtitle-input', (s, v) => { s.subtitle = v; });
  wireText('ribbon-text-input', (s, v) => { s.ribbonText = v; });

  $('frame-toggle').addEventListener('change', (e) => commit((s) => { s.frame = e.target.checked; }));
  $('ribbon-toggle').addEventListener('change', (e) => commit((s) => { s.ribbon = e.target.checked; }));
  $('badge-toggle').addEventListener('change', (e) => commit((s) => { s.badge18 = e.target.checked; }));
  $('title-fill-select').addEventListener('change', (e) => commit((s) => { s.titleFill = e.target.value; }));
  $('placement-select').addEventListener('change', (e) => commit((s) => { s.placement = e.target.value; }));
  $('panel-grade-select').addEventListener('change', (e) => commit(() => {
    selectedPanel().grade = e.target.value || null;
  }));
  $('aspect-select').addEventListener('change', (e) => {
    commit((s) => { s.aspect = e.target.value; });
    sizeCanvasToAspect();
    render();
  });

  document.querySelectorAll('.star-btn').forEach((b) => {
    b.addEventListener('click', () => {
      const v = Number(b.dataset.value);
      commit((s) => { s.stars = (v === 1 && s.stars === 1) ? 0 : v; });
    });
  });

  $('panel-flip-btn').addEventListener('click', () => commit(() => {
    const p = selectedPanel();
    p.flip = !p.flip;
  }));
  $('panel-clear-btn').addEventListener('click', () => commit(() => {
    selectedPanel().src = null;
  }));
  document.querySelectorAll('.nudge-btn').forEach((b) => {
    b.addEventListener('click', () => commit(() => {
      const p = selectedPanel();
      p.dx = Math.round(((p.dx || 0) + Number(b.dataset.dx)) * 1000) / 1000;
      p.dy = Math.round(((p.dy || 0) + Number(b.dataset.dy)) * 1000) / 1000;
    }));
  });

  $('undo-btn').addEventListener('click', undo);
  $('redo-btn').addEventListener('click', redo);
  $('reset-btn').addEventListener('click', () => {
    commit(() => { state = defaultState(); });
    sizeCanvasToAspect();
    toast('Back to the default cover');
  });
  $('export-btn').addEventListener('click', exportPng);

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input[type="text"], textarea, select')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    }
  });
}

// ---------------------------------------------------------------- photos

function addThumb(key, img) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'photo-thumb';
  b.dataset.src = key;
  const thumb = document.createElement('img');
  thumb.src = img.src;
  thumb.alt = key.split('/').pop();
  b.appendChild(thumb);
  b.addEventListener('click', () => {
    armedSrc = armedSrc === key ? null : key;
    document.querySelectorAll('.photo-thumb').forEach((t) => {
      t.classList.toggle('armed', t.dataset.src === armedSrc);
    });
    if (armedSrc) toast('Now click a panel to place the photo');
  });
  $('photo-strip').appendChild(b);
}

function panelIndexAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (canvas.width / rect.width);
  const y = (clientY - rect.top) * (canvas.height / rect.height);
  const rects = panelPixelRects(canvas.width, canvas.height, state.layout);
  return rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}

function placeOrSelect(index) {
  if (index < 0) return;
  if (armedSrc) {
    const src = armedSrc;
    commit((s) => {
      s.panels[index].src = src;
      s.selected = index;
    });
    armedSrc = null;
    document.querySelectorAll('.photo-thumb').forEach((t) => t.classList.remove('armed'));
    toast(`Placed in panel ${index + 1}`);
  } else if (state.selected !== index) {
    commit((s) => { s.selected = index; });
  }
}

function wireCanvas() {
  canvas.addEventListener('click', (e) => placeOrSelect(panelIndexAt(e.clientX, e.clientY)));
  const wrap = $('canvas-wrap');
  wrap.addEventListener('dragover', (e) => e.preventDefault());
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      addUploads(e.dataTransfer.files, panelIndexAt(e.clientX, e.clientY));
    }
  });
  $('upload-input').addEventListener('change', (e) => {
    addUploads(e.target.files, -1);
    e.target.value = '';
  });
  window.addEventListener('resize', () => {
    if (isCoverShot) {
      sizeCanvasToAspect();
      render();
    }
  });
}

async function addUploads(files, targetPanel) {
  let firstKey = null;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const key = `upload:${++uploadCount}`;
    const url = URL.createObjectURL(file);
    const ok = await loadIntoRegistry(key, url);
    if (!ok) continue;
    addThumb(key, images.get(key));
    if (!firstKey) firstKey = key;
  }
  if (firstKey && targetPanel >= 0) {
    armedSrc = firstKey;
    placeOrSelect(targetPanel);
  } else if (firstKey) {
    toast('Photo added — click it, then a panel');
  }
}

// ---------------------------------------------------------------- export

function exportPng() {
  const [w, h] = $('export-size-select').value.split('x').map(Number);
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  renderCover(off.getContext('2d'), w, h, { ...state, showSelection: false }, images);
  off.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'neon-coast-cover.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`Exported ${w}×${h} PNG`);
  }, 'image/png');
}

// ---------------------------------------------------------------- toast

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------------------------------------------------------------- boot

async function boot() {
  buildGrids();
  wireControls();
  wireCanvas();
  sizeCanvasToAspect();
  syncControls();
  updateSelLabel();
  updateHistoryButtons();
  render();

  const fontWait = Promise.race([
    document.fonts.ready,
    new Promise((r) => setTimeout(r, 3500)),
  ]);
  const photoWait = Promise.allSettled(SAMPLES.map(async (src) => {
    await loadIntoRegistry(src, src);
    render();
  })).then(() => {
    // Thumbs join the strip in filename order, not load order.
    for (const src of SAMPLES) {
      if (images.has(src)) addThumb(src, images.get(src));
    }
  });
  await Promise.all([fontWait, photoWait]);
  render();
  // One more pass once the dust settles, so the ready flag never
  // precedes a fully painted cover.
  requestAnimationFrame(() => {
    renderCover(ctx, canvas.width, canvas.height, { ...state, showSelection }, images);
    window.__neonCoastReady = true;
  });
}

boot();
