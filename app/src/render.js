// render.js — the cover compositor for Neon Coast — Cover Studio.
//
// renderCover(ctx, W, H, state, images) paints one complete cover:
//   1. panels   — each layout panel is painted on its own offscreen canvas
//                 (cover-fit, zoom/rotate/flip/offset, then its colour
//                 grade) and composited into place, so grades never bleed
//                 across panel borders;
//   2. finishes — halftone, seeded grain, vignette, cream frame, in order;
//   3. lettering— banner, heat stars, title, subtitle, ribbon, 18+ badge;
//   4. the selection outline (editor only, state.showSelection).
//
// Everything is a pure function of (state, images): the grain is seeded
// from the canvas size and no clock or Math.random is consulted, so the
// same state always renders the identical cover — which is what makes
// the studio's screenshots reproducible.

import { applyGrade } from './grades.js';
import { layoutById } from './layouts.js';

const BG = '#0b0c0f';
const CREAM = '#f6ecd9';

// mulberry32 — tiny deterministic PRNG.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gutterFor(W, H) {
  return Math.max(1.5, Math.min(W, H) * 0.0022);
}

/** Pixel rectangles (gutter-inset) for a layout on a WxH canvas. */
export function panelPixelRects(W, H, layoutId) {
  const g = gutterFor(W, H);
  return layoutById(layoutId).panels.map((p) => ({
    x: p.x * W + g,
    y: p.y * H + g,
    w: p.w * W - g * 2,
    h: p.h * H - g * 2,
  }));
}

function imageFor(images, src) {
  if (!src || !images) return null;
  const img = typeof images.get === 'function' ? images.get(src) : images[src];
  if (!img) return null;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  return w > 0 && h > 0 ? img : null;
}

// Paint one panel onto an offscreen canvas of exactly pw x ph.
function paintPanel(panel, src, pw, ph, gradeId, ink) {
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.round(pw));
  off.height = Math.max(1, Math.round(ph));
  const c = off.getContext('2d');
  const w = off.width;
  const h = off.height;

  if (!src) {
    // Tasteful sunset placeholder.
    const grad = c.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#2b1055');
    grad.addColorStop(0.55, '#7597de');
    grad.addColorStop(0.78, '#ff7b39');
    grad.addColorStop(1, '#ff2e88');
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.setLineDash([8, 7]);
    c.lineWidth = 2;
    c.strokeRect(7, 7, w - 14, h - 14);
    c.setLineDash([]);
    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const size = Math.max(11, Math.min(w, h) * 0.09);
    c.font = `${size}px 'Bebas Neue', sans-serif`;
    c.fillText('A D D   A   P H O T O', w / 2, h / 2);
  } else {
    const iw = src.naturalWidth || src.width;
    const ih = src.naturalHeight || src.height;
    const rot = ((panel.rot || 0) * Math.PI) / 180;
    // Cover-fit scale, enlarged so rotation never uncovers a corner:
    // the rotated image must span the panel's rotated bounding demand.
    let s = Math.max(w / iw, h / ih);
    if (rot !== 0) {
      const cos = Math.abs(Math.cos(rot));
      const sin = Math.abs(Math.sin(rot));
      const needW = (w * cos + h * sin) / iw;
      const needH = (w * sin + h * cos) / ih;
      s = Math.max(s, needW, needH);
    }
    s *= panel.zoom || 1;
    c.save();
    c.translate(w / 2 + (panel.dx || 0) * w, h / 2 + (panel.dy || 0) * h);
    c.rotate(rot);
    c.scale((panel.flip ? -1 : 1) * s, s);
    c.drawImage(src, -iw / 2, -ih / 2);
    c.restore();
  }

  // Grade the finished panel in isolation.
  const data = c.getImageData(0, 0, w, h);
  applyGrade(data, gradeId, ink);
  c.putImageData(data, 0, 0);
  return off;
}

function applyHalftone(ctx, W, H, amount) {
  if (amount <= 0) return;
  // Sample luma on a small grid from a downscaled copy of the canvas.
  const cols = 96;
  const rows = Math.max(2, Math.round(cols * (H / W)));
  const probe = document.createElement('canvas');
  probe.width = cols;
  probe.height = rows;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  pctx.drawImage(ctx.canvas, 0, 0, cols, rows);
  const px = pctx.getImageData(0, 0, cols, rows).data;
  const cellW = W / cols;
  const cellH = H / rows;
  const maxR = Math.min(cellW, cellH) * 0.62;
  ctx.save();
  ctx.fillStyle = '#101018';
  ctx.globalAlpha = Math.min(0.85, amount * 0.9);
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const i = (r * cols + col) * 4;
      const luma = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
      const radius = (1 - luma) * maxR * amount;
      if (radius < 0.4) continue;
      ctx.beginPath();
      ctx.arc((col + 0.5) * cellW, (r + 0.5) * cellH, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function applyGrain(ctx, W, H, amount) {
  if (amount <= 0) return;
  const gw = Math.max(2, Math.round(W / 2));
  const gh = Math.max(2, Math.round(H / 2));
  const noise = document.createElement('canvas');
  noise.width = gw;
  noise.height = gh;
  const nctx = noise.getContext('2d');
  const img = nctx.createImageData(gw, gh);
  const rand = mulberry32((W * 73856093) ^ (H * 19349663) ^ 0x9e3779b9);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 96 + Math.floor(rand() * 64); // mid-grey noise, overlay-friendly
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = Math.min(0.8, amount * 0.75);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(noise, 0, 0, W, H);
  ctx.restore();
}

function applyVignette(ctx, W, H, amount) {
  if (amount <= 0) return;
  const r = Math.hypot(W, H) / 2;
  const grad = ctx.createRadialGradient(W / 2, H / 2, r * 0.42, W / 2, H / 2, r * 1.02);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(4,2,8,${(0.62 * amount).toFixed(3)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function applyFrame(ctx, W, H) {
  const lw = Math.max(2, Math.min(W, H) * 0.007);
  ctx.save();
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = lw;
  ctx.strokeRect(lw / 2, lw / 2, W - lw, H - lw);
  ctx.strokeStyle = 'rgba(20,16,10,0.55)';
  ctx.lineWidth = Math.max(1, lw * 0.28);
  const inset = lw * 1.7;
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  ctx.restore();
}

// Draw text centred at (cx, baselineY) with per-character spacing.
function drawSpacedText(ctx, text, cx, baselineY, spacing) {
  if (!text) return;
  const widths = [];
  let total = 0;
  for (const ch of text) {
    const w = ctx.measureText(ch).width;
    widths.push(w);
    total += w;
  }
  total += spacing * (text.length - 1);
  let x = cx - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x, baselineY);
    x += widths[i] + spacing;
  }
  ctx.textAlign = prevAlign;
}

function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function titleFillStyle(ctx, x, y, size, fill) {
  if (fill === 'neon') return '#3df5ff';
  if (fill === 'white') return '#ffffff';
  const grad = ctx.createLinearGradient(0, y - size, 0, y + size * 0.12);
  if (fill === 'gold') {
    grad.addColorStop(0, '#f9e29c');
    grad.addColorStop(0.55, '#d4af37');
    grad.addColorStop(1, '#8a6d1d');
  } else { // sunset
    grad.addColorStop(0, '#ffd23f');
    grad.addColorStop(0.52, '#ff7b39');
    grad.addColorStop(1, '#ff2e88');
  }
  return grad;
}

function applyLettering(ctx, W, H, state) {
  const cx = W / 2;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Banner — letterspaced, across the top.
  if (state.banner) {
    const size = Math.max(10, H * 0.033);
    ctx.font = `${size}px 'Bebas Neue', sans-serif`;
    ctx.fillStyle = CREAM;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = size * 0.22;
    ctx.shadowOffsetY = size * 0.05;
    drawSpacedText(ctx, state.banner.toUpperCase(), cx, H * 0.066, size * 0.38);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  // Title block geometry: [stars][title][subtitle], anchored by placement.
  const stars = Math.max(0, Math.min(5, state.stars | 0));
  const starR = stars > 0 ? Math.max(7, W * 0.021) : 0;
  const starRowH = stars > 0 ? starR * 2 + H * 0.012 : 0;

  let titleSize = H * 0.155 * (state.titleSize || 1);
  ctx.font = `${titleSize}px Anton, 'Arial Black', sans-serif`;
  const maxTitleW = W * 0.92;
  while (titleSize > 10 && ctx.measureText(state.title || '').width > maxTitleW) {
    titleSize *= 0.94;
    ctx.font = `${titleSize}px Anton, 'Arial Black', sans-serif`;
  }
  const subSize = Math.max(10, H * 0.042);
  const gapT = H * 0.014;
  const gapS = H * 0.006;
  const blockH = starRowH + titleSize + gapT + gapS + subSize;
  let blockTop;
  if (state.placement === 'top') blockTop = H * 0.115;
  else if (state.placement === 'center') blockTop = (H - blockH) / 2;
  else blockTop = H * 0.965 - blockH; // bottom

  // Heat stars, centred above the title.
  if (stars > 0) {
    const cy = blockTop + starR;
    const step = starR * 2.45;
    const startX = cx - (step * 4) / 2;
    for (let i = 0; i < 5; i++) {
      starPath(ctx, startX + i * step, cy, starR);
      if (i < stars) {
        ctx.fillStyle = '#ffc93f';
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(10,8,2,0.65)';
      ctx.lineWidth = Math.max(1, starR * 0.09);
      ctx.stroke();
      if (i >= stars) {
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fill();
      }
    }
  }

  // Title.
  const titleBaseline = blockTop + starRowH + gapT + titleSize * 0.8;
  ctx.font = `${titleSize}px Anton, 'Arial Black', sans-serif`;
  ctx.textAlign = 'center';
  ctx.shadowColor = state.titleFill === 'neon' ? 'rgba(255,46,166,0.85)' : 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = state.titleFill === 'neon' ? titleSize * 0.16 : titleSize * 0.07;
  ctx.shadowOffsetY = titleSize * 0.03;
  ctx.fillStyle = titleFillStyle(ctx, cx, titleBaseline, titleSize, state.titleFill);
  ctx.fillText(state.title || '', cx, titleBaseline);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Subtitle — script face under the title.
  if (state.subtitle) {
    let s = subSize;
    ctx.font = `${s}px Pacifico, cursive`;
    while (s > 9 && ctx.measureText(state.subtitle).width > W * 0.9) {
      s *= 0.94;
      ctx.font = `${s}px Pacifico, cursive`;
    }
    ctx.fillStyle = '#ffd9ec';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = s * 0.25;
    ctx.fillText(state.subtitle, cx, titleBaseline + gapS + s * 0.95);
    ctx.shadowBlur = 0;
  }

  // Ribbon — rotated band across the top-right corner.
  if (state.ribbon && state.ribbonText) {
    const bandH = Math.max(16, H * 0.05);
    const bandLen = W * 0.62;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    ctx.translate(W - bandH * 1.05, bandH * 1.05);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#d90452';
    ctx.fillRect(-bandLen / 2, -bandH / 2, bandLen, bandH);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${bandH * 0.52}px 'Bebas Neue', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawSpacedText(ctx, state.ribbonText.toUpperCase(), 0, bandH * 0.04, bandH * 0.16);
    ctx.restore();
  }

  // 18+ badge — round, bottom-right.
  if (state.badge18) {
    const r = Math.min(88, Math.max(17, W * 0.043));
    const margin = Math.max(10, W * 0.026);
    const bx = W - r - margin;
    const by = H - r - margin;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,8,10,0.92)';
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.07);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `${r * 0.82}px Anton, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('18+', bx, by + r * 0.05);
  }

  ctx.restore();
}

/**
 * Paint the full cover. `images` maps panel.src -> loaded image
 * (a Map or a plain object). Deterministic for a given state.
 */
export function renderCover(ctx, W, H, state, images) {
  ctx.save();
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const rects = panelPixelRects(W, H, state.layout);
  rects.forEach((rect, i) => {
    const panel = state.panels[i] || {};
    const img = imageFor(images, panel.src);
    const painted = paintPanel(panel, img, rect.w, rect.h, panel.grade || state.grade, state.ink || 0);
    ctx.drawImage(painted, rect.x, rect.y);
  });

  applyHalftone(ctx, W, H, state.halftone || 0);
  applyGrain(ctx, W, H, state.grain || 0);
  applyVignette(ctx, W, H, state.vignette || 0);
  if (state.frame) applyFrame(ctx, W, H);

  applyLettering(ctx, W, H, state);

  if (state.showSelection && rects[state.selected]) {
    const rect = rects[state.selected];
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = Math.max(3, W * 0.006);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = Math.max(1.5, W * 0.0032);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }

  ctx.restore();
}
