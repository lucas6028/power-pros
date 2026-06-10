import { Container, Graphics } from "pixi.js";
import type { Scene, SceneContext } from "./scene";
import { GAME_W, GAME_H } from "./scene";
import { makeText } from "../render/text";
import { chibiFront } from "../render/chibi";
import { t } from "../data/index";

export class TitleScene implements Scene {
  readonly name = "title";
  private root = new Container();
  private ctx!: SceneContext;
  private blinkT = 0;
  private pressStart!: Container;

  enter(ctx: SceneContext): void {
    this.ctx = ctx;
    this.root = new Container();

    const bg = new Graphics();
    bg.rect(0, 0, GAME_W, GAME_H).fill(0x1f6e43);
    // diamond motif
    bg.poly([GAME_W / 2, 130, GAME_W / 2 + 240, 330, GAME_W / 2, 530, GAME_W / 2 - 240, 330])
      .fill(0x2a8854)
      .stroke({ width: 6, color: 0xffffff, alpha: 0.25 });
    this.root.addChild(bg);

    const title = makeText(t("title"), {
      fontSize: 72,
      fill: 0xffe14d,
      stroke: { color: 0x7a2f17, width: 10, join: "round" },
    });
    title.anchor.set(0.5);
    title.position.set(GAME_W / 2, 150);
    this.root.addChild(title);

    const sub = makeText(t("subtitle"), { fontSize: 28, fill: 0xffffff });
    sub.anchor.set(0.5);
    sub.position.set(GAME_W / 2, 215);
    this.root.addChild(sub);

    const mascotL = chibiFront({ jersey: 0xe03c31, cap: 0xe03c31, trim: 0x3a2620 });
    mascotL.position.set(GAME_W / 2 - 220, 390);
    const mascotR = chibiFront({ jersey: 0x2255a4, cap: 0x2255a4, trim: 0x3a2620 });
    mascotR.position.set(GAME_W / 2 + 220, 390);
    mascotR.scale.x = -1;
    this.root.addChild(mascotL, mascotR);

    this.pressStart = makeText(t("pressStart"), { fontSize: 30 });
    (this.pressStart as ReturnType<typeof makeText>).anchor.set(0.5);
    this.pressStart.position.set(GAME_W / 2, 420);
    this.root.addChild(this.pressStart);

    ctx.stage.addChild(this.root);
  }

  exit(): void {
    this.root.destroy({ children: true });
  }

  update(_dt: number): void {
    this.blinkT += 1;
    this.pressStart.visible = this.blinkT % 60 < 38;
    if (this.ctx.input.justPressed("Enter") || this.ctx.input.justPressed("Space")) {
      this.ctx.goTo("teamSelect");
    }
  }
}
