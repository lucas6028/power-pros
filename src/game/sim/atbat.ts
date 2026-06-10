import type { Rng } from "../rng";
import type {
  Player,
  PitchResult,
  PitchTypeId,
  PitchEvent,
  SwingAttempt,
  InPlayResult,
  BattedBallKind,
} from "../types";

/** Where the pitcher wants the ball, in strike-zone units. */
export interface PitchIntent {
  pitchType: PitchTypeId;
  targetX: number;
  targetY: number;
}

const BREAK_OFFSETS: Record<PitchTypeId, { dx: number; dy: number; speed: number }> = {
  fastball: { dx: 0, dy: 0, speed: 1.0 },
  slider: { dx: -0.5, dy: -0.15, speed: 0.88 },
  curve: { dx: -0.25, dy: -0.55, speed: 0.78 },
  fork: { dx: 0, dy: -0.6, speed: 0.85 },
  sinker: { dx: 0.35, dy: -0.35, speed: 0.9 },
  changeup: { dx: 0.1, dy: -0.3, speed: 0.8 },
};

export function pitchSpeedKmh(pitcher: Player, pitchType: PitchTypeId): number {
  const velo = pitcher.pitching?.velocity ?? 140;
  return Math.round(velo * BREAK_OFFSETS[pitchType].speed);
}

/** Execute a pitch: intended target plus control-based scatter. */
export function throwPitch(pitcher: Player, intent: PitchIntent, rng: Rng): PitchResult {
  const p = pitcher.pitching;
  const control = p?.control ?? 4;
  const sigma = 0.62 - control * 0.045; // S control: tight; G control: wild
  const x = intent.targetX + rng.gauss() * sigma;
  const y = intent.targetY + rng.gauss() * sigma;
  const speedKmh = pitchSpeedKmh(pitcher, intent.pitchType);
  return {
    pitchType: intent.pitchType,
    x,
    y,
    speed: (speedKmh - 110) / 50, // ~0.5..1.0 for 135..160 km/h
    inZone: Math.abs(x) <= 1 && Math.abs(y) <= 1,
  };
}

/** Contact-cursor radius for a batter, in zone units. Bigger contact grade = bigger sweet zone. */
export function cursorRadius(batter: Player): number {
  return 0.42 + batter.batting.contact * 0.045;
}

/** Resolve a swing (or take) against a pitch. */
export function resolvePitch(
  batter: Player,
  pitch: PitchResult,
  swing: SwingAttempt | null,
  rng: Rng,
): PitchEvent {
  if (swing === null) {
    return pitch.inZone ? { type: "strike", swinging: false } : { type: "ball" };
  }

  const radius = cursorRadius(batter);
  const dist = Math.hypot(pitch.x - swing.x, pitch.y - swing.y);
  // timing error widens effective miss; fast pitches punish late swings more
  const timingPenalty = Math.abs(swing.timing) * (6 + pitch.speed * 4);
  const eff = dist + timingPenalty;

  if (eff > radius * 1.25) {
    return { type: "strike", swinging: true }; // whiff
  }
  if (eff > radius * 0.78) {
    return { type: "foul" };
  }

  // contact quality 1 at dead center, 0 at foul threshold
  const quality = 1 - eff / (radius * 0.78);
  return { type: "inPlay", result: battedBall(batter, quality, swing.timing, rng) };
}

/** Turn contact quality into a batted-ball result. Tuned for arcade baseball shape:
 * league ~.270 AVG, ~12% HR-per-hit, lots of singles. */
function battedBall(batter: Player, quality: number, timing: number, rng: Rng): InPlayResult {
  const power = batter.batting.power; // 1..8
  const traj = batter.batting.trajectory; // 1..4

  // power & quality drive extra bases
  const pow = quality * (0.52 + power * 0.1) + rng.gauss() * 0.15;

  if (pow > 0.94 && traj >= 2) return { type: "homer" };
  if (pow > 0.85) {
    return rng.chance(0.12 + batter.batting.run * 0.012) ? { type: "triple" } : { type: "double" };
  }
  if (pow > 0.72) {
    return rng.chance(0.4) ? { type: "double" } : { type: "single" };
  }

  // weaker contact: hit vs out, speed helps beat out grounders
  const hitChance = 0.13 + quality * 0.4 + batter.batting.run * 0.008;
  if (rng.chance(hitChance)) return { type: "single" };

  const kind = battedKind(traj, timing, rng);
  const dp = kind === "ground" && rng.chance(0.3);
  return { type: "out", kind, double_play: dp };
}

function battedKind(traj: number, timing: number, rng: Rng): BattedBallKind {
  // high trajectory & early timing lift the ball
  const liftBias = traj * 0.12 - timing * 0.5;
  const r = rng.next() + liftBias * 0.3;
  if (r < 0.42) return "ground";
  if (r < 0.62) return "line";
  if (r < 0.88) return "fly";
  return "pop";
}

// ---------------------------------------------------------------------------
// CPU brains — used by headless sim and by the CPU opponent in-game.
// ---------------------------------------------------------------------------

export function cpuSelectPitch(
  pitcher: Player,
  balls: number,
  strikes: number,
  rng: Rng,
): PitchIntent {
  const p = pitcher.pitching;
  const arsenal: PitchTypeId[] = ["fastball", ...(p?.breakingBalls.map((b) => b.type) ?? [])];
  const pitchType = arsenal[rng.int(arsenal.length)] ?? "fastball";

  // ahead in count → chase pitches off the edge; behind → attack the zone
  const ahead = strikes > balls;
  const edge = ahead ? rng.range(1.15, 1.8) : rng.range(0.55, 1.15);
  const angle = rng.range(0, Math.PI * 2);
  return {
    pitchType,
    targetX: Math.cos(angle) * edge,
    targetY: Math.sin(angle) * edge * 0.9,
  };
}

export function cpuSwingDecision(
  batter: Player,
  pitch: PitchResult,
  balls: number,
  strikes: number,
  rng: Rng,
): SwingAttempt | null {
  // perceived location: batters misjudge breaking balls a bit
  const perception = 0.14 + (8 - batter.batting.contact) * 0.02;
  const seenX = pitch.x + rng.gauss() * perception;
  const seenY = pitch.y + rng.gauss() * perception;

  const looksLikeStrike = Math.abs(seenX) <= 1.05 && Math.abs(seenY) <= 1.05;
  const protect = strikes === 2;
  let swingProb = looksLikeStrike
    ? protect
      ? 0.9
      : 0.6 + strikes * 0.1 - balls * 0.06
    : protect
      ? 0.18
      : 0.1 + strikes * 0.04;
  // hitter's count: take unless it's right there
  if (balls === 3 && strikes < 2) swingProb *= 0.3;
  if (!rng.chance(swingProb)) return null;

  // cursor placement error and timing error shrink with contact skill
  const aimErr = 0.32 - batter.batting.contact * 0.024;
  const timingErr = (0.065 - batter.batting.contact * 0.004) * (0.7 + pitch.speed * 0.6);
  return {
    x: pitch.x + rng.gauss() * aimErr,
    y: pitch.y + rng.gauss() * aimErr,
    timing: rng.gauss() * timingErr,
  };
}
