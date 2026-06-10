import type { SceneManager } from "../scenes/scene";
import type { Input } from "../ui/input";

/** Dev-only debug API so Playwright and humans can drive/inspect the game from
 * the console: window.__game. Stripped from production builds by the DEV guard
 * at the install site. */
export interface DebugApi {
  scene(): string;
  getState(): Record<string, unknown>;
  /** Synthesize a key press (e.g. "Enter", "Space", "ArrowLeft"). */
  press(code: string, holdTicks?: number): void;
  hold(code: string): void;
  release(code: string): void;
  /** Jump straight into a game with a fixed seed (deterministic for tests). */
  newGame(awayId: string, homeId: string, seed?: number): void;
}

declare global {
  interface Window {
    __game?: DebugApi;
  }
}

export function installDebugApi(scenes: SceneManager, input: Input): void {
  window.__game = {
    scene: () => scenes.currentName,
    getState: () => ({
      scene: scenes.currentName,
      ...(scenes.currentScene?.debugState?.() ?? {}),
    }),
    press: (code, holdTicks = 1) => input.inject(code, holdTicks),
    hold: (code) => input.inject(code, 0),
    release: (code) => input.release(code),
    newGame: (awayId, homeId, seed = 12345) =>
      scenes.goTo("game", { awayId, homeId, playerTeam: 0, seed }),
  };
}
