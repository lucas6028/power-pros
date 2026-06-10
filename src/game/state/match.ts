import type { PitchEvent, PlayEvent, InPlayResult, Team } from "../types";

export type Half = "top" | "bottom";

export interface MatchState {
  inning: number; // 1-based
  half: Half;
  outs: number;
  balls: number;
  strikes: number;
  /** Lineup index of runner occupying each base, or null. [first, second, third] */
  bases: [number | null, number | null, number | null];
  /** Runs per team. Index 0 = away (bats top), 1 = home. */
  score: [number, number];
  /** Next batter (lineup index 0–8) for each team. */
  nextBatter: [number, number];
  /** Pitch counts for current pitcher of each team. */
  pitchCount: [number, number];
  gameOver: boolean;
  lastPlay: PlayEvent | null;
}

export const MAX_INNINGS = 12; // CPBL regular-season style: tie allowed after 12

export function createMatchState(): MatchState {
  return {
    inning: 1,
    half: "top",
    outs: 0,
    balls: 0,
    strikes: 0,
    bases: [null, null, null],
    score: [0, 0],
    nextBatter: [0, 0],
    pitchCount: [0, 0],
    gameOver: false,
    lastPlay: null,
  };
}

export function battingTeamIndex(s: MatchState): 0 | 1 {
  return s.half === "top" ? 0 : 1;
}

export function fieldingTeamIndex(s: MatchState): 0 | 1 {
  return s.half === "top" ? 1 : 0;
}

export function currentBatterIndex(s: MatchState): number {
  return s.nextBatter[battingTeamIndex(s)];
}

function advanceBatter(s: MatchState): void {
  const t = battingTeamIndex(s);
  s.nextBatter[t] = (s.nextBatter[t] + 1) % 9;
}

function resetCount(s: MatchState): void {
  s.balls = 0;
  s.strikes = 0;
}

function addRuns(s: MatchState, n: number): void {
  s.score[battingTeamIndex(s)] += n;
}

/** Walk-off and end-of-game checks. Called whenever outs reach 3 or runs score. */
function checkGameEnd(s: MatchState): void {
  const [away, home] = s.score;
  // Walk-off: home leads in bottom of 9th or later
  if (s.half === "bottom" && s.inning >= 9 && home > away) {
    s.gameOver = true;
  }
}

function endHalfInning(s: MatchState): void {
  // Home team already ahead going into bottom 9+: game over, skip the half
  if (s.half === "top") {
    if (s.inning >= 9 && s.score[1] > s.score[0]) {
      s.gameOver = true;
      return;
    }
    s.half = "bottom";
  } else {
    if (s.inning >= 9 && s.score[0] !== s.score[1]) {
      s.gameOver = true;
      return;
    }
    if (s.inning >= MAX_INNINGS) {
      s.gameOver = true; // tie game
      return;
    }
    s.half = "top";
    s.inning += 1;
  }
  s.outs = 0;
  s.bases = [null, null, null];
  resetCount(s);
}

function recordOuts(s: MatchState, n: number): void {
  s.outs += n;
  if (s.outs >= 3) {
    endHalfInning(s);
  }
}

/** Advance runners for a batted-ball hit; returns runs scored. */
function applyHit(s: MatchState, result: InPlayResult, batterIdx: number): number {
  const [r1, r2, r3] = s.bases;
  let runs = 0;
  const scoreRunner = (r: number | null): void => {
    if (r !== null) runs += 1;
  };
  switch (result.type) {
    case "single":
      scoreRunner(r3);
      scoreRunner(r2); // runner from 2nd scores on a single (arcade-friendly)
      s.bases = [batterIdx, r1, null];
      break;
    case "double":
      scoreRunner(r3);
      scoreRunner(r2);
      scoreRunner(r1);
      s.bases = [null, batterIdx, null];
      break;
    case "triple":
      scoreRunner(r3);
      scoreRunner(r2);
      scoreRunner(r1);
      s.bases = [null, null, batterIdx];
      break;
    case "homer":
      scoreRunner(r3);
      scoreRunner(r2);
      scoreRunner(r1);
      runs += 1;
      s.bases = [null, null, null];
      break;
    case "out":
      break;
  }
  return runs;
}

/** Outs and runner movement for a ball in play that is fielded. Returns runs scored. */
function applyOut(
  s: MatchState,
  result: Extract<InPlayResult, { type: "out" }>,
  _batterIdx: number,
): number {
  const [r1, r2, r3] = s.bases;
  let runs = 0;
  let outs = 1;

  if (result.kind === "ground") {
    if (result.double_play && r1 !== null && s.outs <= 1) {
      outs = 2;
      s.bases = [null, r2, r3];
    } else if (r1 !== null) {
      // force at second, batter safe? Keep it simple: batter out, runners advance
      s.bases = [null, r1, r2];
      if (r3 !== null && s.outs < 2) runs += 1;
    } else if (s.outs < 2) {
      // no force at second: runners on 2nd/3rd advance on the groundout
      if (r3 !== null) runs += 1;
      s.bases = [null, null, r2];
    }
  } else if (result.kind === "fly" && s.outs < 2) {
    // sac fly from third
    if (r3 !== null) {
      runs += 1;
      s.bases = [r1, r2, null];
    }
  }
  // line drives and pop-ups: runners hold

  addRuns(s, runs);
  recordOuts(s, outs);
  return runs;
}

/** Apply one pitch outcome to the match state. Returns the plate-appearance event
 * if the PA ended, else null (count continues). */
export function applyPitch(s: MatchState, ev: PitchEvent): PlayEvent | null {
  if (s.gameOver) return null;
  s.pitchCount[fieldingTeamIndex(s)] += 1;
  const batterIdx = currentBatterIndex(s);
  s.lastPlay = null;

  switch (ev.type) {
    case "ball": {
      s.balls += 1;
      if (s.balls >= 4) {
        const adv = walkAdvance(s.bases, batterIdx);
        s.bases = adv.bases;
        addRuns(s, adv.runs);
        resetCount(s);
        advanceBatter(s);
        checkGameEnd(s);
        const play: PlayEvent = { type: "walk" };
        s.lastPlay = play;
        return play;
      }
      return null;
    }
    case "strike": {
      s.strikes += 1;
      if (s.strikes >= 3) {
        resetCount(s);
        advanceBatter(s);
        recordOuts(s, 1);
        const play: PlayEvent = { type: "strikeout" };
        s.lastPlay = play;
        return play;
      }
      return null;
    }
    case "foul": {
      if (s.strikes < 2) s.strikes += 1;
      return null;
    }
    case "inPlay": {
      resetCount(s);
      advanceBatter(s);
      let runs = 0;
      if (ev.result.type === "out") {
        runs = applyOut(s, ev.result, batterIdx);
      } else {
        runs = applyHit(s, ev.result, batterIdx);
        addRuns(s, runs);
      }
      checkGameEnd(s);
      const play: PlayEvent = { type: "inPlay", result: ev.result, runsScored: runs };
      s.lastPlay = play;
      return play;
    }
  }
}

function walkAdvance(
  bases: [number | null, number | null, number | null],
  batterIdx: number,
): { bases: [number | null, number | null, number | null]; runs: number } {
  const [r1, r2, r3] = bases;
  let runs = 0;
  let n1: number | null = batterIdx;
  let n2: number | null = r2;
  let n3: number | null = r3;
  if (r1 !== null) {
    n2 = r1;
    if (r2 !== null) {
      n3 = r2;
      if (r3 !== null) runs = 1;
    }
  }
  return { bases: [n1, n2, n3], runs };
}

export interface BoxScore {
  innings: number;
  score: [number, number];
  winner: "away" | "home" | "tie";
}

export function boxScore(s: MatchState, _teams?: [Team, Team]): BoxScore {
  const [a, h] = s.score;
  return {
    innings: s.inning,
    score: [a, h],
    winner: a > h ? "away" : h > a ? "home" : "tie",
  };
}
