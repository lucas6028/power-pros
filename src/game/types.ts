/** Letter grades, Power Pros style. Stored as numbers 1 (G, worst) .. 8 (S, best). */
export type GradeValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const GRADE_LETTERS = ["G", "F", "E", "D", "C", "B", "A", "S"] as const;

export function gradeLetter(g: GradeValue): string {
  return GRADE_LETTERS[g - 1] ?? "?";
}

export type Position = "P" | "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF" | "DH";

export type PitchTypeId = "fastball" | "slider" | "curve" | "fork" | "sinker" | "changeup";

export interface BreakingBall {
  type: Exclude<PitchTypeId, "fastball">;
  /** 1–7, bigger = more break. */
  level: number;
}

export interface BatterStats {
  /** Trajectory 1–4: groundball hitter → big fly. */
  trajectory: number;
  contact: GradeValue;
  power: GradeValue;
  run: GradeValue;
  arm: GradeValue;
  field: GradeValue;
}

export interface PitcherStats {
  /** Top velocity, km/h (CPBL-ish 138–158). */
  velocity: number;
  control: GradeValue;
  stamina: GradeValue;
  breakingBalls: BreakingBall[];
}

export interface Player {
  id: string;
  /** Traditional Chinese name. */
  name: string;
  nameEn?: string;
  position: Position;
  bats: "L" | "R" | "S";
  throws: "L" | "R";
  batting: BatterStats;
  pitching?: PitcherStats;
}

export interface Team {
  id: string;
  name: string;
  nameEn: string;
  abbr: string;
  /** Primary / secondary colors, hex. */
  colors: { primary: string; secondary: string; cap: string };
  /** Batting-order player ids (9, position players). */
  lineup: string[];
  /** Pitcher ids, rotation order. */
  pitchers: string[];
  players: Player[];
}

/** A pitch in flight: where it crosses the plate, in strike-zone units.
 * x: -1..1 left/right edge of zone, y: -1..1 bottom/top. |x|>1 or |y|>1 is a ball. */
export interface PitchResult {
  pitchType: PitchTypeId;
  x: number;
  y: number;
  /** Effective speed factor 0..1 (1 = fastest). */
  speed: number;
  inZone: boolean;
}

/** Batter's swing attempt; null means take. */
export interface SwingAttempt {
  /** Contact-cursor center, strike-zone units. */
  x: number;
  y: number;
  /** Timing error, seconds (negative = early). 0 = perfect. */
  timing: number;
}

export type BattedBallKind = "ground" | "line" | "fly" | "pop";

export type InPlayResult =
  | { type: "out"; kind: BattedBallKind; double_play: boolean }
  | { type: "single" }
  | { type: "double" }
  | { type: "triple" }
  | { type: "homer" };

/** Outcome of a single pitch. */
export type PitchEvent =
  | { type: "ball" }
  | { type: "strike"; swinging: boolean }
  | { type: "foul" }
  | { type: "inPlay"; result: InPlayResult };

/** Plate-appearance level outcome, derived by the match state machine. */
export type PlayEvent =
  | { type: "walk" }
  | { type: "strikeout" }
  | { type: "inPlay"; result: InPlayResult; runsScored: number };
