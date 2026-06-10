import type { Rng } from "../rng";
import type { Team, Player, PlayEvent } from "../types";
import {
  createMatchState,
  applyPitch,
  battingTeamIndex,
  fieldingTeamIndex,
  currentBatterIndex,
  type MatchState,
} from "../state/match";
import { cpuSelectPitch, cpuSwingDecision, throwPitch, resolvePitch } from "./atbat";

export interface GameLog {
  state: MatchState;
  plays: { inning: number; half: string; batter: string; event: PlayEvent }[];
  totalPitches: number;
}

export function currentPitcher(team: Team, _state: MatchState): Player {
  const id = team.pitchers[0];
  const p = team.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`pitcher ${id} not on team ${team.id}`);
  return p;
}

export function batterAt(team: Team, lineupIndex: number): Player {
  const id = team.lineup[lineupIndex];
  const p = team.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`lineup index ${lineupIndex} missing on team ${team.id}`);
  return p;
}

/** Simulate one pitch of CPU-vs-CPU play. Returns the PA event if the PA ended. */
export function simPitch(state: MatchState, teams: [Team, Team], rng: Rng): PlayEvent | null {
  const battingTeam = teams[battingTeamIndex(state)];
  const fieldingTeam = teams[fieldingTeamIndex(state)];
  const batter = batterAt(battingTeam, currentBatterIndex(state));
  const pitcher = currentPitcher(fieldingTeam, state);

  const intent = cpuSelectPitch(pitcher, state.balls, state.strikes, rng);
  const pitch = throwPitch(pitcher, intent, rng);
  const swing = cpuSwingDecision(batter, pitch, state.balls, state.strikes, rng);
  const ev = resolvePitch(batter, pitch, swing, rng);
  return applyPitch(state, ev);
}

/** Simulate a full game between two teams. Deterministic for a given rng. */
export function simulateGame(teams: [Team, Team], rng: Rng): GameLog {
  const state = createMatchState();
  const plays: GameLog["plays"] = [];
  let totalPitches = 0;
  // hard cap to guarantee termination even if logic regresses
  while (!state.gameOver && totalPitches < 3000) {
    const inning = state.inning;
    const half = state.half;
    const battingTeam = teams[battingTeamIndex(state)];
    const batter = batterAt(battingTeam, currentBatterIndex(state));
    const ev = simPitch(state, teams, rng);
    totalPitches += 1;
    if (ev) {
      plays.push({ inning, half, batter: batter.name, event: ev });
    }
  }
  return { state, plays, totalPitches };
}
