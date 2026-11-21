// layouts.js — panel layouts for Neon Coast — Cover Studio.
//
// A layout is a list of panel rectangles in fractional canvas coordinates
// (0..1 on both axes). The rectangles in every layout tile the canvas
// exactly: no gaps, no overlaps — the renderer adds its own hairline
// gutter by insetting each panel as it paints.

function rect(x, y, w, h) {
  return { x, y, w, h };
}

function grid(cols, rows) {
  const panels = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      panels.push(rect(c / cols, r / rows, 1 / cols, 1 / rows));
    }
  }
  return panels;
}

function bands(count, horizontal) {
  const panels = [];
  for (let i = 0; i < count; i++) {
    panels.push(horizontal
      ? rect(0, i / count, 1, 1 / count)
      : rect(i / count, 0, 1 / count, 1));
  }
  return panels;
}

export const LAYOUTS = {
  nine: {
    name: 'Nine-Up Grid',
    panels: grid(3, 3),
  },
  hero: {
    name: 'Hero + Stack',
    panels: [
      rect(0, 0, 0.62, 1),
      rect(0.62, 0, 0.38, 1 / 3),
      rect(0.62, 1 / 3, 0.38, 1 / 3),
      rect(0.62, 2 / 3, 0.38, 1 / 3),
    ],
  },
  duo: {
    name: 'Duo',
    panels: [rect(0, 0, 0.5, 1), rect(0.5, 0, 0.5, 1)],
  },
  trio: {
    name: 'Trio',
    panels: bands(3, false),
  },
  quad: {
    name: 'Quad',
    panels: grid(2, 2),
  },
  stack: {
    name: 'Stack',
    panels: bands(4, true),
  },
  strip: {
    name: 'Strip',
    panels: bands(4, false),
  },
  single: {
    name: 'Single',
    panels: [rect(0, 0, 1, 1)],
  },
};

export const LAYOUT_ORDER = ['nine', 'hero', 'duo', 'trio', 'quad', 'stack', 'strip', 'single'];

export function layoutById(id) {
  return LAYOUTS[id] ?? LAYOUTS.nine;
}
