import type { Page } from "@playwright/test";

export interface GameState {
  scene: string;
  phase?: string;
  score?: [number, number];
  inning?: number;
  half?: string;
  outs?: number;
  balls?: number;
  strikes?: number;
  gameOver?: boolean;
  playerIsBatting?: boolean;
  [key: string]: unknown;
}

export async function getState(page: Page): Promise<GameState> {
  return page.evaluate(() => window.__game!.getState() as never);
}

export async function press(page: Page, code: string, holdTicks = 1): Promise<void> {
  await page.evaluate(
    ([c, h]) => window.__game!.press(c as string, h as number),
    [code, holdTicks],
  );
}

export async function waitForScene(page: Page, scene: string): Promise<void> {
  await page.waitForFunction((s) => window.__game?.scene() === s, scene, { timeout: 15_000 });
}

export async function waitForPhase(page: Page, phase: string): Promise<void> {
  await page.waitForFunction(
    (p) => (window.__game?.getState() as { phase?: string }).phase === p,
    phase,
    { timeout: 20_000 },
  );
}

export async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__game, undefined, { timeout: 15_000 });
}

declare global {
  interface Window {
    __game?: {
      scene(): string;
      getState(): Record<string, unknown>;
      press(code: string, holdTicks?: number): void;
      hold(code: string): void;
      release(code: string): void;
      newGame(awayId: string, homeId: string, seed?: number): void;
    };
  }
}
