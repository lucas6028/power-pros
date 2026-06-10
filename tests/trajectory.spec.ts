import { test, expect } from "@playwright/test";
import { boot, getState } from "./helpers";

interface Point {
  x: number;
  y: number;
}

/** Max deviation of a flight trace from a straight constant-speed flight
 * between its first and last point. Trace points are one per logic tick, so
 * the index is an exact time parameter. A straight pitch deviates ~0. */
function maxDeviation(trace: Point[]): { dx: number; dy: number } {
  const a = trace[0]!;
  const b = trace[trace.length - 1]!;
  let dx = 0;
  let dy = 0;
  trace.forEach((s, i) => {
    const t = i / (trace.length - 1);
    dx = Math.max(dx, Math.abs(s.x - (a.x + (b.x - a.x) * t)));
    dy = Math.max(dy, Math.abs(s.y - (a.y + (b.y - a.y) * t)));
  });
  return { dx, dy };
}

test("breaking balls curve, fastballs fly straight", async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page);
  await page.evaluate(() => window.__game!.newGame("brothers", "dragons", 42));
  await page.evaluate(() => window.__game!.setTimeScale(6));

  const byType = new Map<string, Point[]>();
  const seen = new Set<number>();

  // watch pitches (the game records each flight's trace) until we have both a
  // fastball and at least one breaking ball
  for (let i = 0; i < 600 && (!byType.has("fastball") || byType.size < 2); i++) {
    const st = await getState(page);
    if (st.gameOver || st.scene !== "game") break;
    const phase = st.phase as string;
    if (phase === "selectPitch" || phase === "aim") {
      // our turn to pitch: throw the selected pitch (fastball)
      await page.evaluate(() => window.__game!.press("Space"));
    } else if (phase === "result" && !seen.has(st.pitchSeq as number)) {
      seen.add(st.pitchSeq as number);
      const trace = st.flightTrace as Point[];
      const type = st.pitchType as string;
      if (trace.length >= 10 && !byType.has(type)) byType.set(type, trace);
    }
    await page.waitForTimeout(80);
  }

  console.log("observed pitch types:", [...byType.keys()].join(", "));
  const fb = byType.get("fastball");
  expect(fb, "should have observed a fastball").toBeTruthy();
  const fbDev = maxDeviation(fb!);
  console.log("fastball deviation px:", fbDev);
  // fastballs fly true
  expect(fbDev.dx).toBeLessThan(2);
  expect(fbDev.dy).toBeLessThan(2);

  for (const [type, trace] of byType) {
    if (type === "fastball") continue;
    const dev = maxDeviation(trace);
    console.log(`${type} deviation px:`, dev);
    // breaking balls visibly bend away from the straight path
    expect(dev.dx + dev.dy).toBeGreaterThan(8);
  }
});
