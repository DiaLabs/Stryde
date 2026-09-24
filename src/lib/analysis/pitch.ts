/** Standardized pitch: 105 m × 68 m, origin at top-left corner, x along the length. */
export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;
export const GOAL_HALF_WIDTH = 3.66;
export const GOAL_Y_MIN = PITCH_WIDTH / 2 - GOAL_HALF_WIDTH;
export const GOAL_Y_MAX = PITCH_WIDTH / 2 + GOAL_HALF_WIDTH;

export interface PitchLandmark {
  id: string;
  label: string;
  x: number;
  y: number;
}

const L = PITCH_LENGTH;
const W = PITCH_WIDTH;
const PB_Y0 = W / 2 - 20.16;
const PB_Y1 = W / 2 + 20.16;
const GA_Y0 = W / 2 - 9.16;
const GA_Y1 = W / 2 + 9.16;

export const PITCH_LANDMARKS: PitchLandmark[] = [
  { id: "corner_tl", label: "Corner (top-left)", x: 0, y: 0 },
  { id: "corner_tr", label: "Corner (top-right)", x: L, y: 0 },
  { id: "corner_bl", label: "Corner (bottom-left)", x: 0, y: W },
  { id: "corner_br", label: "Corner (bottom-right)", x: L, y: W },
  { id: "half_top", label: "Halfway line × top touchline", x: L / 2, y: 0 },
  { id: "half_bottom", label: "Halfway line × bottom touchline", x: L / 2, y: W },
  { id: "center_spot", label: "Centre spot", x: L / 2, y: W / 2 },
  { id: "circle_top", label: "Centre circle × halfway (top)", x: L / 2, y: W / 2 - 9.15 },
  { id: "circle_bottom", label: "Centre circle × halfway (bottom)", x: L / 2, y: W / 2 + 9.15 },
  { id: "circle_left", label: "Centre circle (left edge)", x: L / 2 - 9.15, y: W / 2 },
  { id: "circle_right", label: "Centre circle (right edge)", x: L / 2 + 9.15, y: W / 2 },
  { id: "lpb_top_goal", label: "Left penalty box × goal line (top)", x: 0, y: PB_Y0 },
  { id: "lpb_bottom_goal", label: "Left penalty box × goal line (bottom)", x: 0, y: PB_Y1 },
  { id: "lpb_top", label: "Left penalty box corner (top)", x: 16.5, y: PB_Y0 },
  { id: "lpb_bottom", label: "Left penalty box corner (bottom)", x: 16.5, y: PB_Y1 },
  { id: "lga_top_goal", label: "Left goal area × goal line (top)", x: 0, y: GA_Y0 },
  { id: "lga_bottom_goal", label: "Left goal area × goal line (bottom)", x: 0, y: GA_Y1 },
  { id: "lga_top", label: "Left goal area corner (top)", x: 5.5, y: GA_Y0 },
  { id: "lga_bottom", label: "Left goal area corner (bottom)", x: 5.5, y: GA_Y1 },
  { id: "l_pen_spot", label: "Left penalty spot", x: 11, y: W / 2 },
  { id: "rpb_top_goal", label: "Right penalty box × goal line (top)", x: L, y: PB_Y0 },
  { id: "rpb_bottom_goal", label: "Right penalty box × goal line (bottom)", x: L, y: PB_Y1 },
  { id: "rpb_top", label: "Right penalty box corner (top)", x: L - 16.5, y: PB_Y0 },
  { id: "rpb_bottom", label: "Right penalty box corner (bottom)", x: L - 16.5, y: PB_Y1 },
  { id: "rga_top_goal", label: "Right goal area × goal line (top)", x: L, y: GA_Y0 },
  { id: "rga_bottom_goal", label: "Right goal area × goal line (bottom)", x: L, y: GA_Y1 },
  { id: "rga_top", label: "Right goal area corner (top)", x: L - 5.5, y: GA_Y0 },
  { id: "rga_bottom", label: "Right goal area corner (bottom)", x: L - 5.5, y: GA_Y1 },
  { id: "r_pen_spot", label: "Right penalty spot", x: L - 11, y: W / 2 },
];

/** Line segments of the pitch markings (meters) for drawing and reprojection checks. */
export function pitchLineSegments(): [number, number, number, number][] {
  const segs: [number, number, number, number][] = [
    [0, 0, L, 0],
    [L, 0, L, W],
    [L, W, 0, W],
    [0, W, 0, 0],
    [L / 2, 0, L / 2, W],
    [0, PB_Y0, 16.5, PB_Y0],
    [16.5, PB_Y0, 16.5, PB_Y1],
    [16.5, PB_Y1, 0, PB_Y1],
    [0, GA_Y0, 5.5, GA_Y0],
    [5.5, GA_Y0, 5.5, GA_Y1],
    [5.5, GA_Y1, 0, GA_Y1],
    [L, PB_Y0, L - 16.5, PB_Y0],
    [L - 16.5, PB_Y0, L - 16.5, PB_Y1],
    [L - 16.5, PB_Y1, L, PB_Y1],
    [L, GA_Y0, L - 5.5, GA_Y0],
    [L - 5.5, GA_Y0, L - 5.5, GA_Y1],
    [L - 5.5, GA_Y1, L, GA_Y1],
  ];
  const circle = (cx: number, cy: number, r: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const t0 = a0 + ((a1 - a0) * i) / n;
      const t1 = a0 + ((a1 - a0) * (i + 1)) / n;
      segs.push([cx + r * Math.cos(t0), cy + r * Math.sin(t0), cx + r * Math.cos(t1), cy + r * Math.sin(t1)]);
    }
  };
  circle(L / 2, W / 2, 9.15, 0, Math.PI * 2, 36);
  const arc = Math.acos(5.5 / 9.15);
  circle(11, W / 2, 9.15, -arc, arc, 10);
  circle(L - 11, W / 2, 9.15, Math.PI - arc, Math.PI + arc, 10);
  return segs;
}
