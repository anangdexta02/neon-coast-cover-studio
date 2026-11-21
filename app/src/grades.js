// grades.js — photo colour grades for Neon Coast — Cover Studio.
//
// Every grade is a small set of photographic parameters:
//   gain        per-channel multipliers (the "print exposure" of each channel)
//   gamma       a single power curve applied to all channels (< 1 lifts mids)
//   lift        a shadow-weighted offset (> 0 washes blacks out, < 0 crushes)
//   saturation  mix factor against Rec.601 luma (1 = untouched)
//   temperature warm/cool shift (red up, blue down when positive)
//   tint        green/magenta shift (green up when positive)
//   duo         duotone endpoints [shadowRGB, highlightRGB] blended by `ink`
//
// applyGrade() bakes gain/gamma/lift/temperature/tint into three 256-entry
// lookup tables, then walks the pixels once: curve, saturation, duotone.
// The pipeline is pure arithmetic on the pixel values, so a given
// (image, grade, ink) triple always produces the same output.

export const GRADES = [
  {
    id: 'clean', name: 'Clean',
    gain: [1, 1, 1], gamma: 1, lift: 0, saturation: 1,
    temperature: 0, tint: 0, duo: [[0.02, 0.02, 0.03], [1, 0.99, 0.97]],
  },
  {
    id: 'vice', name: 'Vice',
    gain: [1.06, 0.99, 1.05], gamma: 0.96, lift: 0.015, saturation: 1.28,
    temperature: 0.02, tint: 0.015, duo: [[0.02, 0.30, 0.36], [1.0, 0.52, 0.72]],
  },
  {
    id: 'golden', name: 'Golden Hour',
    gain: [1.12, 1.0, 0.84], gamma: 0.94, lift: 0.01, saturation: 1.16,
    temperature: 0.05, tint: 0, duo: [[0.16, 0.07, 0.02], [1.0, 0.83, 0.55]],
  },
  {
    id: 'neon', name: 'Neon Nights',
    gain: [1.05, 0.97, 1.12], gamma: 1.05, lift: -0.01, saturation: 1.45,
    temperature: -0.01, tint: 0.02, duo: [[0.05, 0.03, 0.28], [0.45, 0.95, 1.0]],
  },
  {
    id: 'noir', name: 'Noir',
    gain: [1.02, 1.02, 1.02], gamma: 1.12, lift: -0.02, saturation: 0.06,
    temperature: 0, tint: 0, duo: [[0.0, 0.0, 0.01], [0.98, 0.98, 1.0]],
  },
  {
    id: 'tealheat', name: 'Teal Heat',
    gain: [0.96, 1.04, 1.06], gamma: 0.98, lift: 0.005, saturation: 1.22,
    temperature: 0.015, tint: -0.01, duo: [[0.0, 0.23, 0.27], [1.0, 0.62, 0.30]],
  },
  {
    id: 'faded', name: 'Faded Postcard',
    gain: [1.03, 1.0, 0.95], gamma: 0.92, lift: 0.07, saturation: 0.68,
    temperature: 0.03, tint: 0.005, duo: [[0.23, 0.18, 0.14], [0.97, 0.92, 0.82]],
  },
];

const GRADE_BY_ID = new Map(GRADES.map((g) => [g.id, g]));

export function gradeById(id) {
  return GRADE_BY_ID.get(id) ?? GRADE_BY_ID.get('clean');
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Build one channel's curve: gain, gamma, lift, then a constant offset
// (temperature/tint are expressed as offsets by the caller).
function channelLut(gain, gamma, lift, offset) {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let v = (i / 255) * gain;
    v = Math.pow(Math.max(v, 0), gamma);
    v += lift * (1 - v) * (1 - v); // lift fades out towards white
    v += offset;
    lut[i] = clamp255(Math.round(v * 255));
  }
  return lut;
}

/**
 * Apply a grade to an ImageData in place and return it.
 * `ink` (0..1) controls how strongly the grade's duotone endpoints
 * replace the natural colour: 0 keeps the curved/saturated image,
 * 1 is a full duotone. Grade 'clean' with ink 0 is the identity.
 */
export function applyGrade(imageData, id, ink = 0) {
  const grade = gradeById(id);
  const inkAmt = Math.min(1, Math.max(0, ink));
  if (grade.id === 'clean' && inkAmt === 0) return imageData;

  const [gr, gg, gb] = grade.gain;
  const temp = grade.temperature;
  const tint = grade.tint;
  const lutR = channelLut(gr, grade.gamma, grade.lift, temp - tint * 0.5);
  const lutG = channelLut(gg, grade.gamma, grade.lift, tint);
  const lutB = channelLut(gb, grade.gamma, grade.lift, -temp - tint * 0.5);

  const sat = grade.saturation;
  const keep = 1 - inkAmt;
  const [ds, dh] = grade.duo;
  const dsR = ds[0] * 255, dsG = ds[1] * 255, dsB = ds[2] * 255;
  const dhR = dh[0] * 255, dhG = dh[1] * 255, dhB = dh[2] * 255;

  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = lutR[d[i]];
    let g = lutG[d[i + 1]];
    let b = lutB[d[i + 2]];

    if (sat !== 1) {
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      r = luma + (r - luma) * sat;
      g = luma + (g - luma) * sat;
      b = luma + (b - luma) * sat;
    }

    if (inkAmt > 0) {
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const duoR = dsR + (dhR - dsR) * luma;
      const duoG = dsG + (dhG - dsG) * luma;
      const duoB = dsB + (dhB - dsB) * luma;
      r = r * keep + duoR * inkAmt;
      g = g * keep + duoG * inkAmt;
      b = b * keep + duoB * inkAmt;
    }

    d[i] = clamp255(r);
    d[i + 1] = clamp255(g);
    d[i + 2] = clamp255(b);
  }
  return imageData;
}
