/** Headless full-game simulator: sanity-check that the game logic produces
 * baseball-shaped results. Usage: npm run sim [-- --games 200 --seed 42 --verbose] */
import { createRng } from "../src/game/rng";
import { simulateGame } from "../src/game/sim/autoplay";
import { TEAMS } from "../src/data/index";

const args = process.argv.slice(2);
function argNum(flag: string, dflt: number): number {
  const i = args.indexOf(flag);
  const v = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isFinite(v) ? v : dflt;
}
const numGames = argNum("--games", 200);
const seed = argNum("--seed", 20260610);
const verbose = args.includes("--verbose");

const rng = createRng(seed);
let totalRuns = 0;
let maxRuns = 0;
let ties = 0;
let totalInnings = 0;
let extraInnings = 0;
const counts = { pa: 0, k: 0, bb: 0, hits: 0, hr: 0, singles: 0, doubles: 0, triples: 0 };
const runDist: number[] = [];

for (let g = 0; g < numGames; g++) {
  const away = TEAMS[rng.int(TEAMS.length)]!;
  let home = TEAMS[rng.int(TEAMS.length)]!;
  while (home.id === away.id) home = TEAMS[rng.int(TEAMS.length)]!;

  const log = simulateGame([away, home], rng);
  const [a, h] = log.state.score;
  totalRuns += a + h;
  maxRuns = Math.max(maxRuns, a, h);
  runDist.push(a, h);
  if (a === h) ties++;
  totalInnings += log.state.inning;
  if (log.state.inning > 9) extraInnings++;

  for (const p of log.plays) {
    counts.pa++;
    const e = p.event;
    if (e.type === "strikeout") counts.k++;
    else if (e.type === "walk") counts.bb++;
    else if (e.type === "inPlay" && e.result.type !== "out") {
      counts.hits++;
      if (e.result.type === "homer") counts.hr++;
      else if (e.result.type === "single") counts.singles++;
      else if (e.result.type === "double") counts.doubles++;
      else if (e.result.type === "triple") counts.triples++;
    }
  }

  if (verbose || g < 5) {
    console.log(
      `${away.name} ${a} : ${h} ${home.name}  (${log.state.inning}局, ${log.totalPitches}球)`,
    );
  }
}

const abs = counts.pa - counts.bb; // crude at-bats (ignoring sac flies)
console.log("\n=== sanity stats over", numGames, "games ===");
console.log(`runs/team/game     ${(totalRuns / numGames / 2).toFixed(2)}   (target ~3.5–5.5)`);
console.log(`max team runs      ${maxRuns}   (target < 20)`);
console.log(`ties               ${ties} (${((ties / numGames) * 100).toFixed(1)}%)`);
console.log(`avg innings        ${(totalInnings / numGames).toFixed(2)}  extras: ${extraInnings}`);
console.log(`K%                 ${((counts.k / counts.pa) * 100).toFixed(1)}   (target 15–25)`);
console.log(`BB%                ${((counts.bb / counts.pa) * 100).toFixed(1)}   (target 6–12)`);
console.log(`AVG                ${(counts.hits / abs).toFixed(3)} (target .240–.300)`);
console.log(
  `hits: 1B ${counts.singles}  2B ${counts.doubles}  3B ${counts.triples}  HR ${counts.hr}`,
);
console.log(`HR/game/team       ${(counts.hr / numGames / 2).toFixed(2)}  (target 0.5–1.5)`);

// hard sanity assertions — non-zero exit makes CI/agents notice regressions
const rpg = totalRuns / numGames / 2;
const fail = (msg: string): never => {
  console.error("SANITY FAIL:", msg);
  process.exit(1);
};
if (rpg < 2 || rpg > 8) fail(`runs per team per game ${rpg.toFixed(2)} out of range`);
if (maxRuns >= 30) fail(`a team scored ${maxRuns} runs`);
if (totalInnings / numGames < 8.5) fail("games ending too early");
console.log("\nOK: box scores look baseball-shaped.");
