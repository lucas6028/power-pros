import { Container, Graphics } from "pixi.js";
import type { Scene, SceneContext } from "./scene";
import { GAME_W, GAME_H } from "./scene";
import { makeText } from "../render/text";
import { chibiFront } from "../render/chibi";
import { TEAMS, t } from "../data/index";

const COLS = 3;
const CARD_W = 240;
const CARD_H = 150;

export class TeamSelectScene implements Scene {
  readonly name = "teamSelect";
  private root = new Container();
  private ctx!: SceneContext;
  private cursor = 0;
  private picking: "away" | "home" = "away";
  private awayId: string | null = null;
  private cursorBox!: Graphics;
  private phaseLabel!: ReturnType<typeof makeText>;
  private awayBadge!: ReturnType<typeof makeText>;

  enter(ctx: SceneContext): void {
    this.ctx = ctx;
    this.root = new Container();
    this.cursor = 0;
    this.picking = "away";
    this.awayId = null;

    const bg = new Graphics();
    bg.rect(0, 0, GAME_W, GAME_H).fill(0x24304d);
    this.root.addChild(bg);

    const header = makeText(t("teamSelect"), { fontSize: 40, fill: 0xffe14d });
    header.anchor.set(0.5);
    header.position.set(GAME_W / 2, 48);
    this.root.addChild(header);

    this.phaseLabel = makeText(`${t("away")} ▶`, { fontSize: 26, fill: 0x9adcf0 });
    this.phaseLabel.anchor.set(0.5);
    this.phaseLabel.position.set(GAME_W / 2, 92);
    this.root.addChild(this.phaseLabel);

    this.awayBadge = makeText("", { fontSize: 22, fill: 0xffffff });
    this.awayBadge.position.set(20, 16);
    this.root.addChild(this.awayBadge);

    TEAMS.forEach((team, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = GAME_W / 2 + (col - 1) * (CARD_W + 16) - CARD_W / 2;
      const y = 130 + row * (CARD_H + 24);

      const card = new Container();
      const g = new Graphics();
      const primary = parseInt(team.colors.primary.slice(1), 16);
      const secondary = parseInt(team.colors.secondary.slice(1), 16);
      g.roundRect(0, 0, CARD_W, CARD_H, 14).fill(primary).stroke({ width: 5, color: 0xffffff });
      g.roundRect(0, CARD_H - 44, CARD_W, 44, 14).fill(secondary);
      card.addChild(g);

      const mascot = chibiFront({
        jersey: primary,
        cap: parseInt(team.colors.cap.slice(1), 16),
        trim: secondary,
      });
      mascot.scale.set(0.45);
      mascot.position.set(52, 62);
      card.addChild(mascot);

      const name = makeText(team.name, { fontSize: 30 });
      name.anchor.set(0, 0.5);
      name.position.set(100, 52);
      card.addChild(name);

      const nameEn = makeText(team.nameEn, { fontSize: 14, fontWeight: "400" });
      nameEn.anchor.set(0.5);
      nameEn.position.set(CARD_W / 2, CARD_H - 22);
      card.addChild(nameEn);

      card.position.set(x, y);
      this.root.addChild(card);
    });

    this.cursorBox = new Graphics();
    this.root.addChild(this.cursorBox);
    this.drawCursor();

    ctx.stage.addChild(this.root);
  }

  private drawCursor(): void {
    const col = this.cursor % COLS;
    const row = Math.floor(this.cursor / COLS);
    const x = GAME_W / 2 + (col - 1) * (CARD_W + 16) - CARD_W / 2;
    const y = 130 + row * (CARD_H + 24);
    this.cursorBox.clear();
    this.cursorBox
      .roundRect(x - 8, y - 8, CARD_W + 16, CARD_H + 16, 18)
      .stroke({ width: 6, color: 0xffe14d });
  }

  exit(): void {
    this.root.destroy({ children: true });
  }

  update(_dt: number): void {
    const inp = this.ctx.input;
    let moved = false;
    if (inp.justPressed("ArrowLeft")) {
      this.cursor = (this.cursor + TEAMS.length - 1) % TEAMS.length;
      moved = true;
    }
    if (inp.justPressed("ArrowRight")) {
      this.cursor = (this.cursor + 1) % TEAMS.length;
      moved = true;
    }
    if (inp.justPressed("ArrowUp") || inp.justPressed("ArrowDown")) {
      this.cursor = (this.cursor + COLS) % TEAMS.length;
      moved = true;
    }
    if (moved) this.drawCursor();

    if (inp.justPressed("Escape")) {
      this.ctx.goTo("title");
      return;
    }

    if (inp.justPressed("Enter") || inp.justPressed("Space")) {
      const team = TEAMS[this.cursor]!;
      if (this.picking === "away") {
        this.awayId = team.id;
        this.picking = "home";
        this.phaseLabel.text = `${t("home")} ▶`;
        this.awayBadge.text = `${t("away")}: ${team.name}`;
      } else if (team.id !== this.awayId) {
        this.ctx.goTo("game", { awayId: this.awayId, homeId: team.id, playerTeam: 0 });
      }
    }
  }

  debugState(): Record<string, unknown> {
    return { cursor: this.cursor, picking: this.picking, awayId: this.awayId };
  }
}
