# CLAUDE.md

This file gives Claude Code context when working in this repository.

## Project

A fan-made **Power Pros (実況パワフルプロ野球) style baseball game** featuring
**CPBL (中華職棒大聯盟, Chinese Professional Baseball League)** teams and players.
Chibi characters, arcade pitch-vs-bat gameplay, exhibition mode first, season and
success (サクセス) modes later.

This is a non-commercial fan project. Do not copy Konami assets directly — all art
is original, drawn in a similar chibi style (see `images/` for style references).

## Tech stack

- **TypeScript** (strict mode) + **Vite** for build/dev
- **PixiJS** for 2D rendering (characters are flat SVG/vector-style chibi sprites)
- **Playwright** for testing: screenshot verification + scripted play sessions
- Plain JSON for game data (teams, players, stats) — no backend, runs fully in browser
- No framework for UI; game screens are managed by a simple scene/state machine

## Commands

```sh
npm run dev        # start Vite dev server
npm run build      # production build (tsc + vite build)
npm run test       # Playwright: screenshot + simulated-play tests
npm run sim        # headless: simulate full games, print box scores / sanity stats
npm run lint       # eslint + prettier check
```

(If these scripts don't exist yet, the project is still being scaffolded — create
them to match.)

## Directory layout

```
src/
  main.ts            # entry point, boots Pixi app + scene manager
  scenes/            # one file per screen: Title, TeamSelect, Game, Result
  game/              # pure game logic, NO rendering code
    sim/             # at-bat simulation: pitch physics, contact, fielding
    state/           # match state machine (inning, outs, count, baserunners)
  render/            # Pixi sprites, animations, field drawing
  data/              # JSON: teams, players, stadiums
  ui/                # menus, HUD, cursor/gamepad input
images/              # art style references (Power Pros chibi look)
```

Keep `game/` free of PixiJS imports — simulation must be testable headless.
All gameplay logic should be deterministic given an RNG seed (seedable PRNG,
never `Math.random()` inside `game/`).

## Game design pillars

1. **The pitch–bat duel is the game.** Camera behind the batter, pitcher selects
   pitch type + location, batter moves a contact cursor and times the swing.
   Get this loop fun before building anything else.
2. **Chibi style**: oversized head (~50% of body height), dot-pupil eyes, no nose,
   tiny limbs, bold dark outlines, flat colors. Match `images/character.png`.
3. **Arcade over simulation**: readable stats (Power, Contact/ミート, Run, Arm,
   Field on a G–S scale; pitchers have velocity, control, stamina, breaking balls).
   Stats map to gameplay feel, not real-world physics accuracy.

## CPBL data conventions

- The six CPBL teams (use these ids in data files):

  | id          | 中文     | English                       |
  |-------------|----------|-------------------------------|
  | `brothers`  | 中信兄弟 | CTBC Brothers                 |
  | `lions`     | 統一獅   | Uni-President 7-Eleven Lions  |
  | `monkeys`   | 樂天桃猿 | Rakuten Monkeys               |
  | `guardians` | 富邦悍將 | Fubon Guardians               |
  | `dragons`   | 味全龍   | Wei Chuan Dragons             |
  | `hawks`     | 台鋼雄鷹 | TSG Hawks                     |

- Player names are stored in **Traditional Chinese** (`name`) with an optional
  `nameEn` romanization. UI text is Traditional Chinese (zh-TW) first; keep all
  strings in `src/data/strings.json` so an English locale can be added later.
- Player ratings are hand-tuned for fun, loosely based on real CPBL performance —
  do not scrape or embed real stat lines verbatim.
- Schema for players/teams lives in `src/data/schema.ts` (zod); the sim runner
  and dev build validate all JSON on load, so bad data fails loudly.

## Conventions

- Strict TS, no `any`; prefer discriminated unions for game events
  (e.g. `{ type: "strike" } | { type: "ball" } | { type: "inPlay", ... }`).
- Fixed-timestep game loop (60 Hz logic, render interpolated) — input timing is
  gameplay-critical.
- One scene per file; scenes own their Pixi containers and clean up on exit.

## Testing — screenshots and simulated play, not unit tests

Don't write conventional unit tests. Verify changes the way a player would see
them:

1. **Screenshot verification.** After any visual change, run the dev server,
   drive the game to the affected screen with Playwright, capture a screenshot
   into `tests/screenshots/`, and *look at it* (Read the PNG) to confirm the
   result. Baseline screenshots are committed; update them deliberately when
   visuals change on purpose.
2. **Simulated play.** Test gameplay by playing it:
   - `npm run sim` runs headless full-game simulations on the `game/` logic
     (no rendering) — check box scores are baseball-shaped (no 50-run games,
     ~1–8 runs typical, games end after 9+ innings, outs/count rules hold).
   - Playwright scripts that actually play through a flow end-to-end: navigate
     menus, pick teams, throw pitches, swing — asserting on visible game state
     (scoreboard, count display), with screenshots at key moments.
3. The game must stay **scriptable**: expose a small debug API on `window`
   (e.g. `__game.getState()`, `__game.input(...)`, seedable RNG) so Playwright
   and the sim runner can drive and inspect it. Keep this in dev builds only.

When asked to verify a change, prefer launching the game and observing it over
reasoning about the code.

## Git

- This repo uses git; commit as you go — one focused commit per working change,
  not one giant commit at the end.
- Commit messages in English, short imperative subject.
- Commit baseline screenshots, but never `node_modules/`, build output, or
  Playwright traces/reports (keep `.gitignore` current).
