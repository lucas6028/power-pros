import { Container, Graphics } from "pixi.js";
import type { Scene, SceneContext } from "./scene";
import { GAME_W, GAME_H } from "./scene";
import { makeText } from "../render/text";
import { chibiFront } from "../render/chibi";
import { teamById, t } from "../data/index";

export interface ResultParams {
  awayId: string;
  homeId: string;
  score: [number, number];
  innings: number;
}

export class ResultScene implements Scene {
  readonly name = "result";
  private root = new Container();
  private ctx!: SceneContext;
  private params!: ResultParams;

  enter(ctx: SceneContext, params?: unknown): void {
    this.ctx = ctx;
    this.params = params as ResultParams;
    this.root = new Container();

    const away = teamById(this.params.awayId);
    const home = teamById(this.params.homeId);
    const [a, h] = this.params.score;

    const bg = new Graphics();
    bg.rect(0, 0, GAME_W, GAME_H).fill(0x24304d);
    this.root.addChild(bg);

    const header = makeText(t("gameSet"), { fontSize: 56, fill: 0xffe14d });
    header.anchor.set(0.5);
    header.position.set(GAME_W / 2, 90);
    this.root.addChild(header);

    const score = makeText(`${away.name}  ${a} - ${h}  ${home.name}`, { fontSize: 42 });
    score.anchor.set(0.5);
    score.position.set(GAME_W / 2, 200);
    this.root.addChild(score);

    const winnerTeam = a > h ? away : h > a ? home : null;
    const verdict = winnerTeam ? `${winnerTeam.name} ${t("win")}！` : `${t("tie")}！`;
    const verdictText = makeText(verdict, { fontSize: 34, fill: 0x9adcf0 });
    verdictText.anchor.set(0.5);
    verdictText.position.set(GAME_W / 2, 270);
    this.root.addChild(verdictText);

    if (winnerTeam) {
      const mascot = chibiFront({
        jersey: parseInt(winnerTeam.colors.primary.slice(1), 16),
        cap: parseInt(winnerTeam.colors.cap.slice(1), 16),
        trim: parseInt(winnerTeam.colors.secondary.slice(1), 16),
      });
      mascot.position.set(GAME_W / 2, 400);
      this.root.addChild(mascot);
    }

    const hint = makeText(`Enter: ${t("playAgain")}　Esc: ${t("backToTitle")}`, {
      fontSize: 20,
      fontWeight: "400",
    });
    hint.anchor.set(0.5);
    hint.position.set(GAME_W / 2, GAME_H - 30);
    this.root.addChild(hint);

    ctx.stage.addChild(this.root);
  }

  exit(): void {
    this.root.destroy({ children: true });
  }

  update(_dt: number): void {
    if (this.ctx.input.justPressed("Enter")) this.ctx.goTo("teamSelect");
    if (this.ctx.input.justPressed("Escape")) this.ctx.goTo("title");
  }

  debugState(): Record<string, unknown> {
    return { score: this.params.score };
  }
}
