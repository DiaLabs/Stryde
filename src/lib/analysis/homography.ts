export type Mat3 = number[]; // row-major 3x3

export interface Point {
  x: number;
  y: number;
}

function normalizePoints(pts: Point[]): { T: Mat3; pts: Point[] } {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const md = pts.reduce((s, p) => s + Math.hypot(p.x - mx, p.y - my), 0) / n || 1;
  const s = Math.SQRT2 / md;
  const T = [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1];
  return { T, pts: pts.map((p) => ({ x: s * (p.x - mx), y: s * (p.y - my) })) };
}

export function mul3(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
}

export function inv3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d];
  return inv.map((v) => v / det);
}

/** Solve A x = b (n×n) with partial pivoting. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Least-squares homography (h33 = 1) from ≥4 correspondences with Hartley normalization.
 * Maps src → dst.
 */
export function solveHomography(src: Point[], dst: Point[]): Mat3 | null {
  if (src.length < 4 || src.length !== dst.length) return null;
  const ns = normalizePoints(src);
  const nd = normalizePoints(dst);
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Atb = new Array(8).fill(0);
  const addRow = (row: number[], rhs: number) => {
    for (let i = 0; i < 8; i++) {
      Atb[i] += row[i] * rhs;
      for (let j = 0; j < 8; j++) AtA[i][j] += row[i] * row[j];
    }
  };
  for (let k = 0; k < src.length; k++) {
    const { x, y } = ns.pts[k];
    const { x: u, y: v } = nd.pts[k];
    addRow([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    addRow([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  const h = solve(AtA, Atb);
  if (!h) return null;
  const Hn = [...h, 1];
  const TdInv = inv3(nd.T);
  if (!TdInv) return null;
  const H = mul3(mul3(TdInv, Hn), ns.T);
  const s = H[8];
  if (Math.abs(s) < 1e-12) return null;
  return H.map((v) => v / s);
}

export function applyHomography(H: Mat3, x: number, y: number): Point | null {
  const w = H[6] * x + H[7] * y + H[8];
  if (Math.abs(w) < 1e-9) return null;
  const px = (H[0] * x + H[1] * y + H[2]) / w;
  const py = (H[3] * x + H[4] * y + H[5]) / w;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  return { x: px, y: py };
}

/** Rough degeneracy check: correspondences must not be (near) collinear. */
export function isWellSpread(pts: Point[]): boolean {
  if (pts.length < 4) return false;
  let maxArea = 0;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      for (let k = j + 1; k < pts.length; k++) {
        const a = Math.abs(
          (pts[j].x - pts[i].x) * (pts[k].y - pts[i].y) - (pts[k].x - pts[i].x) * (pts[j].y - pts[i].y)
        );
        maxArea = Math.max(maxArea, a);
      }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  return maxArea / (span * span) > 0.02;
}
