import { Container, Graphics } from "pixi.js";
import type { Scene, SceneContext } from "./scene";
import { GAME_W, GAME_H } from "./scene";
import { makeText } from "../render/text";
import { drawField } from "../render/field";
import { chibiFront, chibiBatterBack } from "../render/chibi";
import { teamById, t } from "../data/index";
import { createRng, type Rng } from "../game/rng";
import type {
  Team,
  Player,
  PitchResult,
  SwingAttempt,
  PitchTypeId,
  PlayEvent,
} from "../game/types";
import {
  createMatchState,
  applyPitch,
  battingTeamIndex,
  fieldingTeamIndex,
  currentBatterIndex,
  type MatchState,
} from "../game/state/match";
import {
  cpuSelectPitch,
  cpuSwingDecision,
  throwPitch,
  resolvePitch,
  cursorRadius,
  pitchSpeedKmh,
  pitchBreakVector,
  type PitchIntent,
} from "../game/sim/atbat";
import { batterAt, currentPitcher } from "../game/sim/autoplay";

export interface GameParams {
  awayId: string;
  homeId: string;
  /** Which side the human controls (0 = away, 1 = home). */
  playerTeam: 0 | 1;
  seed?: number;
}

type Phase = "preparePitch" | "selectPitch" | "aim" | "flight" | "result";

const ZONE_CX = GAME_W / 2;
const ZONE_CY = 408;
const ZONE_SCALE = 72; // pixels per strike-zone unit
const RELEASE = { x: GAME_W / 2, y: 252 };
const TICK = 1 / 60;
/** Swing animation length in logic ticks. */
const SWING_TICKS = 24;
/** Minimum pause after every pitch resolves before the next one (5 s at 60 Hz). */
const RESULT_WAIT_TICKS = 300;

const PITCH_NAMES: Record<PitchTypeId, string> = {
  fastball: "直球",
  slider: "滑球",
  curve: "曲球",
  fork: "指叉球",
  sinker: "伸卡球",
  changeup: "變速球",
};

export class GameScene implements Scene {
  readonly name = "game";
  private root = new Container();
  private ctx!: SceneContext;
  private rng: Rng = createRng(1);
  private teams!: [Team, Team];
  private playerTeam: 0 | 1 = 0;
  private state: MatchState = createMatchState();

  private phase: Phase = "preparePitch";
  private timer = 0;

  // current pitch
  private pitch: PitchResult | null = null;
  private intent: PitchIntent | null = null;
  private flightT = 0;
  private flightTime = 0.6;
  private swing: SwingAttempt | null = null;
  private swung = false;
  private lastPlay: PlayEvent | null = null;
  /** Screen-space break of the pitch in flight (drawn arriving late). */
  private breakScreen = { x: 0, y: 0 };
  /** Ball positions of the most recent flight, one per logic tick (debug/tests). */
  private flightTrace: { x: number; y: number }[] = [];
  private pitchSeq = 0;

  // player pitching UI
  private pitchSel = 0;
  private aim = { x: 0, y: 0 };
  // player batting UI
  private cursor = { x: 0, y: 0 };

  // display objects
  private ball!: Graphics;
  private cursorG!: Graphics;
  private aimG!: Graphics;
  private zoneG!: Graphics;
  private pitcherC: Container | null = null;
  private batterC: Container | null = null;
  private batterBat: Graphics | null = null;
  private charLayer = new Container();
  private msg!: ReturnType<typeof makeText>;
  private speedText!: ReturnType<typeof makeText>;
  private scoreText!: ReturnType<typeof makeText>;
  private inningText!: ReturnType<typeof makeText>;
  private countG!: Graphics;
  private basesG!: Graphics;
  private pitchListC!: Container;
  private hintText!: ReturnType<typeof makeText>;
  private batterText!: ReturnType<typeof makeText>;
  private swingTicks = 0;
  private swingDir = 1;
  private currentBatterId = "";
  private countLabels: ReturnType<typeof makeText>[] = [];

  enter(ctx: SceneContext, params?: unknown): void {
    const p = params as GameParams;
    this.ctx = ctx;
    this.root = new Container();
    this.charLayer = new Container();
    this.teams = [teamById(p.awayId), teamById(p.homeId)];
    this.playerTeam = p.playerTeam;
    this.rng = createRng(p.seed ?? Date.now() & 0xffffffff);
    this.state = createMatchState();
    this.phase = "preparePitch";
    this.timer = 30;
    this.lastPlay = null;
    this.currentBatterId = "";

    this.root.addChild(drawField());
    this.root.addChild(this.charLayer);

    this.zoneG = new Graphics();
    this.drawZone();
    this.root.addChild(this.zoneG);

    this.ball = new Graphics();
    this.ball.circle(0, 0, 11).fill(0xffffff).stroke({ width: 3, color: 0x3a2620 });
    this.ball.moveTo(-6, -3).quadraticCurveTo(0, 0, -6, 3).stroke({ width: 2, color: 0xd44 });
    this.ball.moveTo(6, -3).quadraticCurveTo(0, 0, 6, 3).stroke({ width: 2, color: 0xd44 });
    this.ball.visible = false;
    this.root.addChild(this.ball);

    this.cursorG = new Graphics();
    this.aimG = new Graphics();
    this.root.addChild(this.cursorG, this.aimG);

    // HUD
    const hudBg = new Graphics();
    hudBg.roundRect(12, 10, 250, 92, 10).fill({ color: 0x1a1a2e, alpha: 0.82 });
    hudBg.roundRect(GAME_W - 132, 10, 120, 110, 10).fill({ color: 0x1a1a2e, alpha: 0.82 });
    this.root.addChild(hudBg);

    this.scoreText = makeText("", { fontSize: 24 });
    this.scoreText.position.set(24, 16);
    this.inningText = makeText("", { fontSize: 18, fill: 0x9adcf0 });
    this.inningText.position.set(24, 48);
    this.countG = new Graphics();
    this.basesG = new Graphics();
    this.msg = makeText("", { fontSize: 44, fill: 0xffe14d });
    this.msg.anchor.set(0.5);
    this.msg.position.set(GAME_W / 2, 180);
    this.speedText = makeText("", { fontSize: 22 });
    this.speedText.anchor.set(0.5);
    this.speedText.position.set(GAME_W / 2 + 190, 330);
    this.batterText = makeText("", { fontSize: 18 });
    this.batterText.position.set(24, 74);
    this.hintText = makeText(t("swingHint"), { fontSize: 14, fontWeight: "400" });
    this.hintText.anchor.set(0.5);
    this.hintText.position.set(GAME_W / 2, GAME_H - 8);
    this.pitchListC = new Container();
    this.pitchListC.position.set(20, GAME_H - 160);
    this.root.addChild(
      this.scoreText,
      this.inningText,
      this.countG,
      this.basesG,
      this.msg,
      this.speedText,
      this.batterText,
      this.hintText,
      this.pitchListC,
    );

    this.countLabels = [];
    this.rebuildCharacters();
    this.refreshHud();
    ctx.stage.addChild(this.root);
  }

  exit(): void {
    this.root.destroy({ children: true });
    this.pitcherC = null;
    this.batterC = null;
  }

  // ---------------------------------------------------------------- helpers

  private get battingTeam(): Team {
    return this.teams[battingTeamIndex(this.state)];
  }
  private get fieldingTeam(): Team {
    return this.teams[fieldingTeamIndex(this.state)];
  }
  private get batter(): Player {
    return batterAt(this.battingTeam, currentBatterIndex(this.state));
  }
  private get pitcher(): Player {
    return currentPitcher(this.fieldingTeam, this.state);
  }
  private get playerIsBatting(): boolean {
    return battingTeamIndex(this.state) === this.playerTeam;
  }

  private zoneToScreen(x: number, y: number): { x: number; y: number } {
    return { x: ZONE_CX + x * ZONE_SCALE, y: ZONE_CY - y * ZONE_SCALE };
  }

  private drawZone(): void {
    this.zoneG.clear();
    this.zoneG
      .rect(ZONE_CX - ZONE_SCALE, ZONE_CY - ZONE_SCALE, ZONE_SCALE * 2, ZONE_SCALE * 2)
      .fill({ color: 0xffffff, alpha: 0.1 })
      .stroke({ width: 3, color: 0xffffff, alpha: 0.75 });
    // ninths grid
    for (let i = 1; i < 3; i++) {
      const o = -ZONE_SCALE + (2 * ZONE_SCALE * i) / 3;
      this.zoneG
        .moveTo(ZONE_CX + o, ZONE_CY - ZONE_SCALE)
        .lineTo(ZONE_CX + o, ZONE_CY + ZONE_SCALE)
        .moveTo(ZONE_CX - ZONE_SCALE, ZONE_CY + o)
        .lineTo(ZONE_CX + ZONE_SCALE, ZONE_CY + o)
        .stroke({ width: 1, color: 0xffffff, alpha: 0.3 });
    }
  }

  private rebuildCharacters(): void {
    this.charLayer.removeChildren().forEach((c) => c.destroy({ children: true }));

    const fieldColors = this.fieldingTeam.colors;
    this.pitcherC = chibiFront({
      jersey: parseInt(fieldColors.primary.slice(1), 16),
      cap: parseInt(fieldColors.cap.slice(1), 16),
      trim: parseInt(fieldColors.secondary.slice(1), 16),
    });
    this.pitcherC.scale.set(0.52);
    this.pitcherC.position.set(GAME_W / 2, 252);
    this.charLayer.addChild(this.pitcherC);

    const batColors = this.battingTeam.colors;
    const batsLeft = this.batter.bats === "L";
    this.batterC = chibiBatterBack(
      {
        jersey: parseInt(batColors.primary.slice(1), 16),
        cap: parseInt(batColors.cap.slice(1), 16),
        trim: parseInt(batColors.secondary.slice(1), 16),
      },
      batsLeft,
    );
    this.batterC.scale.set(0.95);
    this.batterC.position.set(GAME_W / 2 + (batsLeft ? 150 : -150), GAME_H - 70);
    this.batterC.rotation = 0;
    this.batterBat = this.batterC.getChildByLabel("bat") as Graphics | null;
    this.swingTicks = 0;
    this.cursor = { x: 0, y: 0 }; // new batter starts with a centered cursor
    this.charLayer.addChild(this.batterC);
    this.currentBatterId = this.batter.id;
  }

  private refreshHud(): void {
    const [away, home] = this.teams;
    const s = this.state;
    this.scoreText.text = `${away.abbr} ${s.score[0]} - ${s.score[1]} ${home.abbr}`;
    this.inningText.text = `${s.inning}${t("inning")}${s.half === "top" ? t("top") : t("bottom")}`;
    this.batterText.text = `${this.batter.position} ${this.batter.name}`;

    // count lamps
    this.countG.clear();
    this.countLabels.forEach((l) => l.destroy());
    this.countLabels = [];
    const lampRow = (
      label: "B" | "S" | "O",
      row: number,
      total: number,
      lit: number,
      color: number,
    ): void => {
      const lt = makeText(label, { fontSize: 14, fill: 0x9a9ab8 });
      lt.anchor.set(0.5);
      lt.position.set(152, 24 + row * 24);
      this.root.addChild(lt);
      this.countLabels.push(lt);
      for (let i = 0; i < total; i++) {
        this.countG
          .circle(172 + i * 22, 24 + row * 24, 8)
          .fill(i < lit ? color : 0x3c3c50)
          .stroke({ width: 2, color: 0x10101c });
      }
    };
    lampRow("B", 0, 3, this.state.balls, 0x4caf50);
    lampRow("S", 1, 2, this.state.strikes, 0xffc107);
    lampRow("O", 2, 2, this.state.outs, 0xf44336);

    // bases diamond (top-right)
    this.basesG.clear();
    const bx = GAME_W - 72;
    const by = 64;
    const sz = 17;
    const diamonds: [number, number, number | null][] = [
      [bx + 28, by, this.state.bases[0]],
      [bx, by - 28, this.state.bases[1]],
      [bx - 28, by, this.state.bases[2]],
    ];
    for (const [dx, dy, occ] of diamonds) {
      this.basesG
        .poly([dx, dy - sz, dx + sz, dy, dx, dy + sz, dx - sz, dy])
        .fill(occ !== null ? 0xffe14d : 0x3c3c50)
        .stroke({ width: 3, color: 0xffffff });
    }
  }

  // ---------------------------------------------------------------- update

  update(_dt: number): void {
    if (this.ctx.input.justPressed("Escape")) {
      this.ctx.goTo("title");
      return;
    }
    switch (this.phase) {
      case "preparePitch":
        this.updatePrepare();
        break;
      case "selectPitch":
        this.updateSelectPitch();
        break;
      case "aim":
        this.updateAim();
        break;
      case "flight":
        this.updateFlight();
        break;
      case "result":
        this.updateResult();
        break;
    }
    this.updateSwingAnimation();
  }

  /** Bat swing: cock back, sweep through the zone, hold the follow-through. */
  private updateSwingAnimation(): void {
    if (this.swingTicks <= 0 || !this.batterC) return;
    this.swingTicks -= 1;
    const t = 1 - this.swingTicks / SWING_TICKS;
    const dir = this.swingDir;

    let batAngle: number;
    let lean: number;
    if (t < 0.15) {
      const k = t / 0.15;
      batAngle = k * 0.4; // cock back
      lean = k * 0.06;
    } else if (t < 0.45) {
      const k = (t - 0.15) / 0.3;
      batAngle = 0.4 - k * 2.7; // sweep across the plate
      lean = 0.06 - k * 0.22;
    } else {
      batAngle = -2.3; // follow-through
      lean = -0.16;
    }
    if (this.batterBat) this.batterBat.rotation = dir * batAngle;
    this.batterC.rotation = dir * lean;

    if (this.swingTicks === 0) {
      if (this.batterBat) this.batterBat.rotation = 0;
      this.batterC.rotation = 0;
    }
  }

  private updatePrepare(): void {
    if (this.currentBatterId !== this.batter.id) this.rebuildCharacters();
    this.msg.text = "";
    this.speedText.text = "";
    this.ball.visible = false;
    this.swing = null;
    this.swung = false;
    this.pitch = null;
    this.aim = { x: 0, y: 0 };

    // the batter can set up the swing spot before the pitch
    if (this.playerIsBatting) this.updateBattingCursor();

    if (this.timer > 0) {
      this.timer -= 1;
      return;
    }
    if (this.playerIsBatting) {
      // CPU throws after a beat
      this.intent = cpuSelectPitch(this.pitcher, this.state.balls, this.state.strikes, this.rng);
      this.startFlight(throwPitch(this.pitcher, this.intent, this.rng));
    } else {
      this.pitchSel = 0;
      this.buildPitchList();
      this.phase = "selectPitch";
    }
  }

  private arsenal(): PitchTypeId[] {
    return ["fastball", ...(this.pitcher.pitching?.breakingBalls.map((b) => b.type) ?? [])];
  }

  private buildPitchList(): void {
    this.pitchListC.removeChildren().forEach((c) => c.destroy({ children: true }));
    const arsenal = this.arsenal();
    const bg = new Graphics();
    bg.roundRect(-8, -8, 150, arsenal.length * 30 + 12, 8).fill({ color: 0x1a1a2e, alpha: 0.82 });
    this.pitchListC.addChild(bg);
    arsenal.forEach((pt, i) => {
      const label = makeText(`${i === this.pitchSel ? "▶ " : "　"}${PITCH_NAMES[pt]}`, {
        fontSize: 20,
        fill: i === this.pitchSel ? 0xffe14d : 0xffffff,
      });
      label.position.set(0, i * 30);
      this.pitchListC.addChild(label);
    });
    this.pitchListC.visible = true;
  }

  private updateSelectPitch(): void {
    const inp = this.ctx.input;
    const n = this.arsenal().length;
    if (inp.justPressed("ArrowUp")) {
      this.pitchSel = (this.pitchSel + n - 1) % n;
      this.buildPitchList();
    }
    if (inp.justPressed("ArrowDown")) {
      this.pitchSel = (this.pitchSel + 1) % n;
      this.buildPitchList();
    }
    if (inp.justPressed("Space") || inp.justPressed("Enter")) {
      this.pitchListC.visible = false;
      this.phase = "aim";
    }
  }

  private updateAim(): void {
    const inp = this.ctx.input;
    const sp = 0.045;
    if (inp.isDown("ArrowLeft")) this.aim.x -= sp;
    if (inp.isDown("ArrowRight")) this.aim.x += sp;
    if (inp.isDown("ArrowUp")) this.aim.y += sp;
    if (inp.isDown("ArrowDown")) this.aim.y -= sp;
    this.aim.x = Math.max(-1.6, Math.min(1.6, this.aim.x));
    this.aim.y = Math.max(-1.6, Math.min(1.6, this.aim.y));

    const p = this.zoneToScreen(this.aim.x, this.aim.y);
    this.aimG.clear();
    this.aimG
      .moveTo(p.x - 14, p.y)
      .lineTo(p.x + 14, p.y)
      .moveTo(p.x, p.y - 14)
      .lineTo(p.x, p.y + 14)
      .stroke({ width: 4, color: 0xff5252 });
    this.aimG.circle(p.x, p.y, 10).stroke({ width: 3, color: 0xff5252 });

    if (inp.justPressed("Space") || inp.justPressed("Enter")) {
      const pt = this.arsenal()[this.pitchSel] ?? "fastball";
      this.intent = { pitchType: pt, targetX: this.aim.x, targetY: this.aim.y };
      this.aimG.clear();
      const pitch = throwPitch(this.pitcher, this.intent, this.rng);
      // CPU batter decides as the ball leaves the hand
      this.swing = cpuSwingDecision(
        this.batter,
        pitch,
        this.state.balls,
        this.state.strikes,
        this.rng,
      );
      this.startFlight(pitch);
    }
  }

  private startFlight(pitch: PitchResult): void {
    this.pitch = pitch;
    this.flightT = 0;
    this.flightTime = 1.05 - pitch.speed * 0.45;
    const brk = pitchBreakVector(this.pitcher, pitch.pitchType);
    this.breakScreen = { x: brk.dx * ZONE_SCALE, y: -brk.dy * ZONE_SCALE };
    this.flightTrace = [];
    this.pitchSeq += 1;
    this.phase = "flight";
    this.ball.visible = true;
    this.ball.position.set(RELEASE.x, RELEASE.y);
    this.ball.scale.set(0.45);
    this.speedText.text = `${pitchSpeedKmh(this.pitcher, pitch.pitchType)} ${t("kmh")}`;
  }

  /** Move and draw the batting cursor; active whenever the player's side is at
   * the plate — including the wait between pitches, so the spot can be set early. */
  private updateBattingCursor(): void {
    const inp = this.ctx.input;
    const sp = 0.055;
    if (inp.isDown("ArrowLeft")) this.cursor.x -= sp;
    if (inp.isDown("ArrowRight")) this.cursor.x += sp;
    if (inp.isDown("ArrowUp")) this.cursor.y += sp;
    if (inp.isDown("ArrowDown")) this.cursor.y -= sp;
    this.cursor.x = Math.max(-1.5, Math.min(1.5, this.cursor.x));
    this.cursor.y = Math.max(-1.5, Math.min(1.5, this.cursor.y));

    const c = this.zoneToScreen(this.cursor.x, this.cursor.y);
    const r = cursorRadius(this.batter) * ZONE_SCALE * 0.78;
    this.cursorG.clear();
    this.cursorG.ellipse(c.x, c.y, r, r * 0.72).fill({ color: 0x4da6ff, alpha: 0.35 });
    this.cursorG.ellipse(c.x, c.y, r, r * 0.72).stroke({ width: 3, color: 0x4da6ff });
  }

  private updateFlight(): void {
    const inp = this.ctx.input;
    const pitch = this.pitch!;

    if (this.playerIsBatting) {
      this.updateBattingCursor();

      if (!this.swung && inp.justPressed("Space")) {
        this.swung = true;
        this.swingTicks = SWING_TICKS;
        this.swingDir = this.batter.bats === "L" ? -1 : 1;
        this.swing = {
          x: this.cursor.x,
          y: this.cursor.y,
          timing: this.flightT - this.flightTime,
        };
      }
    }

    this.flightT += TICK;
    const k = Math.min(1, this.flightT / this.flightTime);
    const start = RELEASE;
    const end = this.zoneToScreen(pitch.x, pitch.y);
    // the ball travels straight toward where it would cross without movement,
    // and the break bends it onto the real location late (k²); fastballs have
    // zero break and fly true
    const brk = this.breakScreen;
    const late = k * k;
    const bx = start.x + (end.x - brk.x - start.x) * k + brk.x * late;
    const by = start.y + (end.y - brk.y - start.y) * k + brk.y * late;
    this.ball.position.set(bx, by);
    this.ball.scale.set(0.45 + k * 0.75);
    this.flightTrace.push({ x: bx, y: by });

    // CPU batter starts its swing as the ball arrives
    if (!this.playerIsBatting && this.swing && this.swingTicks === 0 && k >= 0.8) {
      this.swingTicks = SWING_TICKS;
      this.swingDir = this.batter.bats === "L" ? -1 : 1;
    }

    if (k >= 1) {
      this.resolveCurrentPitch();
    }
  }

  private resolveCurrentPitch(): void {
    const pitch = this.pitch!;
    const ev = resolvePitch(this.batter, pitch, this.swing, this.rng);
    const play = applyPitch(this.state, ev);
    this.lastPlay = play;
    this.cursorG.clear();

    // message
    let text: string;
    if (play) {
      text = this.playText(play);
    } else if (ev.type === "ball") {
      text = t("ball");
    } else if (ev.type === "foul") {
      text = t("foul");
    } else {
      text = t("strike");
    }
    this.msg.text = text;
    this.refreshHud();
    this.phase = "result";
    this.timer = RESULT_WAIT_TICKS;
  }

  private playText(play: PlayEvent): string {
    switch (play.type) {
      case "walk":
        return t("walk");
      case "strikeout":
        return t("strikeout");
      case "inPlay": {
        const r = play.result;
        let base: string;
        if (r.type === "out") {
          base =
            r.kind === "ground"
              ? r.double_play
                ? t("doublePlay")
                : t("groundOut")
              : r.kind === "fly"
                ? t("flyOut")
                : r.kind === "line"
                  ? t("lineOut")
                  : t("popOut");
        } else {
          base = t(r.type);
        }
        return play.runsScored > 0 ? `${base}！${play.runsScored} ${t("run")}` : base;
      }
    }
  }

  private updateResult(): void {
    if (this.timer > 0) {
      this.timer -= 1;
      // the ball rests at the plate briefly, then disappears for the rest of the wait
      if (this.ball.visible && this.timer < RESULT_WAIT_TICKS - 45) this.ball.visible = false;
      // keep the swing spot adjustable through the between-pitch wait
      if (this.playerIsBatting) this.updateBattingCursor();
      return;
    }
    if (this.state.gameOver) {
      this.ctx.goTo("result", {
        awayId: this.teams[0].id,
        homeId: this.teams[1].id,
        score: [...this.state.score],
        innings: this.state.inning,
      });
      return;
    }
    this.phase = "preparePitch";
    this.timer = 25;
  }

  debugState(): Record<string, unknown> {
    return {
      phase: this.phase,
      score: [...this.state.score],
      inning: this.state.inning,
      half: this.state.half,
      outs: this.state.outs,
      balls: this.state.balls,
      strikes: this.state.strikes,
      bases: [...this.state.bases],
      batter: this.batter.name,
      pitcher: this.pitcher.name,
      playerIsBatting: this.playerIsBatting,
      cursorX: this.cursor.x,
      cursorY: this.cursor.y,
      pitchType: this.pitch?.pitchType ?? null,
      ballX: this.ball.visible ? this.ball.position.x : null,
      ballY: this.ball.visible ? this.ball.position.y : null,
      pitchSeq: this.pitchSeq,
      flightTrace: [...this.flightTrace],
      gameOver: this.state.gameOver,
      lastPlay: this.lastPlay,
    };
  }
}
