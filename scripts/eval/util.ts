import type { RgbaImage } from "../../src/lib/vision/features";

export function parseArgs(argv: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = "true";
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

/** Bilinear RGBA resize (close to the browser's default canvas downscale). */
export function resizeBilinear(src: RgbaImage, dw: number, dh: number): RgbaImage {
  const { data, width: sw, height: sh } = src;
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xr = sw / dw;
  const yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    const fy = Math.max(0, (y + 0.5) * yr - 0.5);
    const y0 = Math.min(sh - 1, Math.floor(fy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.max(0, (x + 0.5) * xr - 0.5);
      const x0 = Math.min(sw - 1, Math.floor(fx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const wx = fx - x0;
      const a = (y0 * sw + x0) * 4;
      const b = (y0 * sw + x1) * 4;
      const c = (y1 * sw + x0) * 4;
      const d = (y1 * sw + x1) * 4;
      const o = (y * dw + x) * 4;
      for (let k = 0; k < 4; k++) {
        out[o + k] = (data[a + k] * (1 - wx) + data[b + k] * wx) * (1 - wy) + (data[c + k] * (1 - wx) + data[d + k] * wx) * wy;
      }
    }
  }
  return { data: out, width: dw, height: dh };
}

/** JSON.stringify replacer: round floats to 5 significant decimals to keep fixtures small. */
export function roundForJson(_key: string, value: unknown) {
  return typeof value === "number" && !Number.isInteger(value) ? Math.round(value * 1e5) / 1e5 : value;
}
