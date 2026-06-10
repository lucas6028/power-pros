import { Container, Graphics } from "pixi.js";
import { GAME_W, GAME_H } from "../scenes/scene";

/** Behind-the-batter view of the field: sky, outfield wall, grass, dirt mound. */
export function drawField(): Container {
  const c = new Container();
  const g = new Graphics();

  // sky
  g.rect(0, 0, GAME_W, 230).fill(0x9adcf0);
  // outfield wall
  g.rect(0, 200, GAME_W, 36).fill(0x2e6b46);
  g.rect(0, 230, GAME_W, 6).fill(0xf2e94e);
  // grass
  g.rect(0, 236, GAME_W, GAME_H - 236).fill(0x57b368);
  // mowing stripes
  for (let i = 0; i < 6; i++) {
    g.rect(0, 246 + i * 50, GAME_W, 24).fill(0x4ea65e);
  }
  // infield dirt arc behind the mound
  g.ellipse(GAME_W / 2, 330, 320, 110).fill(0xd9a36b);
  g.ellipse(GAME_W / 2, 330, 320, 110).stroke({ width: 5, color: 0xc28b52 });
  // pitcher's mound
  g.ellipse(GAME_W / 2, 300, 90, 34).fill(0xc89058);
  g.rect(GAME_W / 2 - 16, 296, 32, 7)
    .fill(0xffffff)
    .stroke({ width: 2, color: 0x999999 });

  // home plate area (bottom center, foreground)
  g.ellipse(GAME_W / 2, GAME_H + 30, 280, 120).fill(0xd9a36b);
  // home plate
  g.poly([
    GAME_W / 2 - 28,
    GAME_H - 44,
    GAME_W / 2 + 28,
    GAME_H - 44,
    GAME_W / 2 + 22,
    GAME_H - 28,
    GAME_W / 2,
    GAME_H - 16,
    GAME_W / 2 - 22,
    GAME_H - 28,
  ])
    .fill(0xffffff)
    .stroke({ width: 3, color: 0x888888 });
  // batter's boxes
  g.rect(GAME_W / 2 - 130, GAME_H - 90, 78, 80).stroke({ width: 4, color: 0xffffff });
  g.rect(GAME_W / 2 + 52, GAME_H - 90, 78, 80).stroke({ width: 4, color: 0xffffff });

  c.addChild(g);
  return c;
}
