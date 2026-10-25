// Hostel 7 Volleyball — warm nostalgic campus palette (~60 colours)
// Used both for material tinting and for GPU-side OKLab palette quantization.

export const PALETTE_HEX: number[] = [
  // concrete / hostel greys & beige
  0x9a948a, 0xb4aea0, 0xcac2b2, 0xe4dcc8, 0x6f695f, 0x565249, 0x3c3934, 0x8a7f6a,
  0xd9c9a3, 0xc2ad82, 0xa68a5c, 0x7a6243, 0xf0e4c0,
  // campus greens
  0x2e5e36, 0x3c7a42, 0x4f9a52, 0x6fb55a, 0x8fcf66, 0x264a28, 0x1c3620, 0x587a3a,
  0x9ca84a, 0x3a5a2a,
  // autumn / olive
  0xb3792a, 0xd4972f, 0xe9b94a, 0xc46a2d, 0x8a5a2a, 0x8f8a3a,
  // sunset / sky
  0xff9d52, 0xffb870, 0xff7043, 0xffe08c, 0xf4623a, 0x7a4a8a, 0x4a3a7a, 0x2c2a5a,
  // day sky / blues
  0x8fd0ef, 0xb7e4f7, 0x3a7fc1, 0x235a92, 0x163a63,
  // night blues
  0x0c1430, 0x16204a, 0x202f5f, 0x0a0f22, 0x2a3a6a,
  // team colours
  0xc0362c, 0xe2493b, 0x8c2420, 0x2f5fb0, 0x4a7fe0, 0x1e3f7e,
  // volleyball yellow + accents
  0xffd23f, 0xffe98a, 0xe0a81e, 0xffffff, 0xe8e4d8,
  // skin tones
  0xf2c49b, 0xdba06f, 0xb87b4d, 0x8c5a35, 0x5f3a22, 0xffdcb0,
  // misc
  0x1a1a1a, 0x303030, 0x7a2d2d, 0x2d4a2d,
];

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToLinearRgb(hex: number): [number, number, number] {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

// linear sRGB -> OKLab
function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

export const PALETTE_OKLAB: Float32Array = (() => {
  const arr = new Float32Array(PALETTE_HEX.length * 3);
  PALETTE_HEX.forEach((hex, i) => {
    const [r, g, b] = hexToLinearRgb(hex);
    const [L, a, bb] = linearToOklab(r, g, b);
    arr[i * 3] = L;
    arr[i * 3 + 1] = a;
    arr[i * 3 + 2] = bb;
  });
  return arr;
})();

export const PALETTE_RGB: Float32Array = (() => {
  const arr = new Float32Array(PALETTE_HEX.length * 3);
  PALETTE_HEX.forEach((hex, i) => {
    arr[i * 3] = ((hex >> 16) & 255) / 255;
    arr[i * 3 + 1] = ((hex >> 8) & 255) / 255;
    arr[i * 3 + 2] = (hex & 255) / 255;
  });
  return arr;
})();

// Find nearest palette colour using OKLab distance with lightness weighting.
export function quantizeColor(hex: number, lightnessWeight = 1.35): number {
  const [r, g, b] = hexToLinearRgb(hex);
  const [L, a, bb] = linearToOklab(r, g, b);
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PALETTE_HEX.length; i++) {
    const dl = (L - PALETTE_OKLAB[i * 3]) * lightnessWeight;
    const da = a - PALETTE_OKLAB[i * 3 + 1];
    const db = bb - PALETTE_OKLAB[i * 3 + 2];
    const dist = dl * dl + da * da + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return PALETTE_HEX[best];
}

export const MAX_PALETTE_SIZE = 64;
