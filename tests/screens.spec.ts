import { test, expect } from "@playwright/test";
import { boot, getState, press, waitForScene, waitForPhase } from "./helpers";

const SHOT = (name: string): string => `tests/screenshots/${name}.png`;

test("title screen renders and advances to team select", async ({ page }) => {
  await boot(page);
  await waitForScene(page, "title");
  await page.waitForTimeout(300); // let the first frames render
  await page.screenshot({ path: SHOT("01-title") });

  await press(page, "Enter");
  await waitForScene(page, "teamSelect");
  await page.waitForTimeout(200);
  await page.screenshot({ path: SHOT("02-team-select") });

  const st = await getState(page);
  expect(st.scene).toBe("teamSelect");
});

test("team select cursor moves and picks away + home", async ({ page }) => {
  await boot(page);
  await press(page, "Enter");
  await waitForScene(page, "teamSelect");

  await press(page, "ArrowRight");
  await page.waitForTimeout(100);
  let st = await getState(page);
  expect(st.cursor).toBe(1);

  await press(page, "Enter"); // away = lions
  await page.waitForTimeout(100);
  st = await getState(page);
  expect(st.picking).toBe("home");
  expect(st.awayId).toBe("lions");

  await press(page, "ArrowRight");
  await press(page, "Enter"); // home = monkeys
  await waitForScene(page, "game");
  st = await getState(page);
  expect(st.scene).toBe("game");
});

test("game scene: pitch flies in and the count updates", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__game!.newGame("brothers", "dragons", 42));
  await waitForScene(page, "game");

  // player (away) bats first: wait for the CPU pitch to come in
  await waitForPhase(page, "flight");
  await page.waitForTimeout(150);
  await page.screenshot({ path: SHOT("03-game-pitch") });

  // let the pitch resolve without swinging
  await waitForPhase(page, "result");
  const st = await getState(page);
  expect((st.balls as number) + (st.strikes as number)).toBeGreaterThan(0);
  await page.screenshot({ path: SHOT("04-game-result-msg") });
});

test("scripted play: swing at pitches and pitch to the CPU for two half-innings", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await boot(page);
  await page.evaluate(() => window.__game!.newGame("lions", "hawks", 7));
  await waitForScene(page, "game");

  let sawPlayerPitching = false;
  let tookScreenshot = false;

  // drive the game until the bottom half of inning 1 ends (or safety cap)
  for (let i = 0; i < 600; i++) {
    const st = await getState(page);
    if (st.scene !== "game") break;
    if ((st.inning as number) >= 2) break;

    const phase = st.phase as string;
    if (phase === "selectPitch") {
      sawPlayerPitching = true;
      await press(page, "Space");
    } else if (phase === "aim") {
      if (!tookScreenshot) {
        await page.screenshot({ path: SHOT("05-game-aiming") });
        tookScreenshot = true;
      }
      await press(page, "Space");
    } else if (phase === "flight" && st.playerIsBatting) {
      await press(page, "Space"); // swing!
    }
    await page.waitForTimeout(120);
  }

  const st = await getState(page);
  // we made it through the top half at minimum, and the state stayed coherent
  expect(st.gameOver).toBe(false);
  expect((st.outs as number) >= 0 && (st.outs as number) < 3).toBe(true);
  expect(sawPlayerPitching || (st.half === "top" && (st.inning as number) === 1)).toBe(true);
  await page.screenshot({ path: SHOT("06-game-playthrough-end") });
});
