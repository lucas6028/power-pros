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
- **PixiJS 8** for 2D menu/UI scenes (Title, TeamSelect, Result — flat vector-style
  chibi sprites)
- **Three.js** for the in-game 3D view (the pitch–bat duel): perspective camera
  behind the batter; chibi figures + field built from primitives (toon shading +
  inverted-hull outline for the bold chibi look)
- The in-game **HUD is an HTML/CSS DOM overlay** over the WebGL canvas (zh-TW text
  rendered by the browser, no WebGL fonts)
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
  main.ts            # entry: boots Pixi app + ThreeStage; fixed-timestep loop; letterbox fit
  scenes/            # scene.ts = SceneManager + Scene interface + GAME_W/H (960×540);
                     #   Title / TeamSelect / Result = 2D Pixi, GameScene = 3D Three.js
  game/              # pure game logic, NO rendering imports (no Pixi / Three)
    sim/             # at-bat simulation: pitch physics, contact, fielding
    state/           # match state machine (inning, outs, count, baserunners)
  render/            # 2D Pixi: chibi.ts, text.ts · 3D Three.js: chibi3d.ts,
                     #   field3d.ts, three-stage.ts (WebGL host + world→screen projection)
  data/              # JSON teams/players + schema.ts (zod) + index.ts loader
  ui/                # hud.ts (DOM overlay HUD), input.ts, debug.ts (dev __game API)
images/              # art style references (Power Pros chibi look)
```

Keep `game/` free of rendering imports (PixiJS **and** Three.js) — simulation must
be testable headless. All gameplay logic should be deterministic given an RNG seed
(seedable PRNG, never `Math.random()` inside `game/`).

## Rendering architecture

Rendering is **hybrid**. A Pixi `Application` and a Three.js `WebGLRenderer`
(wrapped by `render/three-stage.ts` as `ThreeStage`) share one letterboxed rect at a
fixed **960×540** logical resolution (`GAME_W`/`GAME_H` in `scenes/scene.ts`). 2D
menu scenes draw to the Pixi stage; `GameScene` calls `three.activate(scene, camera)`
on enter and drives its own `render()` once per animation frame.

- `scenes/scene.ts` owns `SceneManager`, the `Scene` interface (note the optional
  `render?()` hook for 3D scenes), and `SceneContext` (`stage`, `three`, `overlay`,
  `input`, `goTo`).
- The HUD (`ui/hud.ts`) is an HTML/CSS overlay authored in the same 960×540 space and
  CSS-scaled onto the canvas, so zh-TW text is rendered by the browser.
- `ThreeStage.project()` maps world points to 960×540 pixel space so screenshot /
  trajectory tests stay comparable to the old 2D renderer. World coords live in
  `render/field3d.ts` (`WORLD`): home plate at the origin, pitcher toward −Z, camera
  behind the batter.

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
