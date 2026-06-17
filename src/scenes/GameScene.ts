import * as THREE from "three";
import type { Scene, SceneContext } from "./scene";
import { buildField, makeCamera, WORLD } from "../render/field3d";
import { makeChibiPitcher, makeChibiBatter } from "../render/chibi3d";
import { Hud } from "../ui/hud";
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

type Phase = "preparePitch" | "selectPitch" | "aim" | "windup" | "flight" | "result";

const TICK = 1 / 60;
/** Swing animation length in logic ticks. */
const SWING_TICKS = 24;
/** Pitching wind-up length in logic ticks: raise → hold → snap forward. */
const WINDUP_TICKS = 48;
/** Minimum pause after every pitch resolves before the next one (5 s at 60 Hz). */
const RESULT_WAIT_TICKS = 300;

/** Pitcher's feet rest on top of the mound/rubber. */
const PITCHER_BASE_Y = 0.3;
/** World metres per strike-zone unit of break, exaggerated for arcade readability
 * (also keeps projected trajectory deviation comparable to the old 2D renderer). */
const BREAK_WORLD = 1.6;

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
  /** Start/end world points + late break vector of the active flight. */
  private flightStart = new THREE.Vector3();
  private flightEnd = new THREE.Vector3();
  private breakWorld = { x: 0, y: 0 };
  /** World (x, y) ball positions of the most recent flight, one per logic tick
   * (debug/tests). World space is uniform per tick so a fastball traces a line. */
  private flightTrace: { x: number; y: number }[] = [];
  private pitchSeq = 0;
  // wind-up
  private windupTicks = 0;
  private pendingPitch: PitchResult | null = null;

  // player pitching UI
  private pitchSel = 0;
  private aim = { x: 0, y: 0 };
  // player batting UI
  private cursor = { x: 0, y: 0 };

  // three.js scene graph
  private scene3d = new THREE.Scene();
  private camera = makeCamera();
  private ball!: THREE.Mesh;
  private cursorRing!: THREE.Mesh;
  private aimRing!: THREE.Mesh;
  private pitcher3d: THREE.Group | null = null;
  private pitcherArm: THREE.Object3D | null = null;
  private pitcherArmBall: THREE.Object3D | null = null;
  private batter3d: THREE.Group | null = null;
  private batterBat: THREE.Object3D | null = null;
  private charLayer = new THREE.Group();
  private hud!: Hud;
  private swingTicks = 0;
  private swingDir = 1;
  private currentBatterId = "";

  enter(ctx: SceneContext, params?: unknown): void {
    const p = params as GameParams;
    this.ctx = ctx;
    this.teams = [teamById(p.awayId), teamById(p.homeId)];
    this.playerTeam = p.playerTeam;
    this.rng = createRng(p.seed ?? Date.now() & 0xffffffff);
    this.state = createMatchState();
    this.phase = "preparePitch";
    this.timer = 30;
    this.lastPlay = null;
    this.currentBatterId = "";

    this.scene3d = new THREE.Scene();
    this.scene3d.background = new THREE.Color(0x9adcf0);
    this.camera = makeCamera();
    this.scene3d.add(buildField());

    this.charLayer = new THREE.Group();
    this.scene3d.add(this.charLayer);

    this.buildZone();

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 18, 14),
      new THREE.MeshToonMaterial({ color: 0xffffff }),
    );
    this.ball.visible = false;
    this.scene3d.add(this.ball);

    this.cursorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.16, 32),
      new THREE.MeshBasicMaterial({ color: 0x4da6ff, transparent: true, opacity: 0.9 }),
    );
    this.cursorRing.visible = false;
    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.14, 32),
      new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0.95 }),
    );
    this.aimRing.visible = false;
    this.scene3d.add(this.cursorRing, this.aimRing);

    this.hud = new Hud(ctx.overlay);

    this.rebuildCharacters();
    this.refreshHud();
    ctx.three.activate(this.scene3d, this.camera);
  }

  exit(): void {
    this.hud.dispose();
    this.ctx.three.deactivate();
    this.disposeScene();
    this.pitcher3d = null;
    this.batter3d = null;
  }

  render(): void {
    this.ctx.three.render();
  }

  // ---------------------------------------------------------------- helpers

  private disposeScene(): void {
    this.scene3d.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    this.scene3d.clear();
  }

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

  /** Strike-zone unit coordinates → world point on the zone plane over the plate. */
  private zoneToWorld(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(
      x * WORLD.zoneUnit,
      WORLD.zoneCenterY + y * WORLD.zoneUnit,
      WORLD.zoneZ,
    );
  }

  private hexColors(team: Team): { jersey: number; cap: number; trim: number } {
    return {
      jersey: parseInt(team.colors.primary.slice(1), 16),
      cap: parseInt(team.colors.cap.slice(1), 16),
      trim: parseInt(team.colors.secondary.slice(1), 16),
    };
  }

  private buildZone(): void {
    const u = WORLD.zoneUnit;
    const cy = WORLD.zoneCenterY;
    const z = WORLD.zoneZ - 0.01;

    // faint fill
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * u, 2 * u),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
      }),
    );
    fill.position.set(0, cy, z);
    this.scene3d.add(fill);

    const seg = (pts: THREE.Vector3[], opacity: number): THREE.Line =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity }),
      );

    // bold outer box
    this.scene3d.add(
      seg(
        [
          new THREE.Vector3(-u, cy - u, z),
          new THREE.Vector3(u, cy - u, z),
          new THREE.Vector3(u, cy + u, z),
          new THREE.Vector3(-u, cy + u, z),
          new THREE.Vector3(-u, cy - u, z),
        ],
        0.75,
      ),
    );
    // inner thirds grid
    for (let i = 1; i < 3; i++) {
      const o = -u + (2 * u * i) / 3;
      this.scene3d.add(
        seg([new THREE.Vector3(o, cy - u, z), new THREE.Vector3(o, cy + u, z)], 0.3),
      );
      this.scene3d.add(
        seg([new THREE.Vector3(-u, cy + o, z), new THREE.Vector3(u, cy + o, z)], 0.3),
      );
    }
  }

  private rebuildCharacters(): void {
    this.charLayer.clear();

    this.pitcher3d = makeChibiPitcher(this.hexColors(this.fieldingTeam));
    this.pitcher3d.scale.setScalar(1.7); // larger so the wind-up reads at distance
    this.pitcher3d.position.set(0, PITCHER_BASE_Y, WORLD.moundZ + 0.3);
    this.pitcherArm = this.pitcher3d.getObjectByName("arm") ?? null;
    this.pitcherArmBall = this.pitcherArm?.getObjectByName("armBall") ?? null;
    this.charLayer.add(this.pitcher3d);

    const batsLeft = this.batter.bats === "L";
    this.batter3d = makeChibiBatter(this.hexColors(this.battingTeam), batsLeft);
    this.batter3d.position.set(batsLeft ? WORLD.batterX : -WORLD.batterX, 0, WORLD.batterZ);
    this.batterBat = this.batter3d.getObjectByName("bat") ?? null;
    this.charLayer.add(this.batter3d);

    this.swingTicks = 0;
    this.cursor = { x: 0, y: 0 }; // new batter starts with a centered cursor
    this.currentBatterId = this.batter.id;
  }

  private refreshHud(): void {
    const [away, home] = this.teams;
    const s = this.state;
    this.hud.update({
      scoreLine: `${away.abbr} ${s.score[0]} - ${s.score[1]} ${home.abbr}`,
      inning: `${s.inning}${t("inning")}${s.half === "top" ? t("top") : t("bottom")}`,
      batter: `${this.batter.position} ${this.batter.name}`,
      balls: s.balls,
      strikes: s.strikes,
      outs: s.outs,
      bases: [s.bases[0] !== null, s.bases[1] !== null, s.bases[2] !== null],
      message: this.msgText,
      speed: this.speedTextStr,
      hint: t("swingHint"),
      pitchList: this.pitchListData,
    });
  }

  // HUD text is held on the instance so refreshHud can re-emit the full state
  private msgText = "";
  private speedTextStr = "";
  private pitchListData: { names: string[]; selected: number } | null = null;

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
      case "windup":
        this.updateWindup();
        break;
      case "flight":
        this.updateFlight();
        break;
      case "result":
        this.updateResult();
        break;
    }
    this.updateSwingAnimation();
    // after the release, the pitcher eases back to the set position
    if (this.phase !== "windup" && this.pitcherArm && this.pitcher3d) {
      this.pitcherArm.rotation.x *= 0.88;
      this.pitcher3d.rotation.x *= 0.88;
      this.pitcher3d.position.y += (PITCHER_BASE_Y - this.pitcher3d.position.y) * 0.15;
      if (Math.abs(this.pitcherArm.rotation.x) < 0.02) this.pitcherArm.rotation.x = 0;
      if (Math.abs(this.pitcher3d.rotation.x) < 0.005) this.pitcher3d.rotation.x = 0;
    }
  }

  /** Start the pitching motion; the ball is released (startFlight) at its end. */
  private beginWindup(pitch: PitchResult): void {
    this.pendingPitch = pitch;
    this.windupTicks = WINDUP_TICKS;
    this.phase = "windup";
    if (this.pitcherArmBall) this.pitcherArmBall.visible = true;
  }

  /** Raise the throwing arm overhead, hold, then snap forward and release. */
  private updateWindup(): void {
    if (this.playerIsBatting) this.updateBattingCursor();

    this.windupTicks -= 1;
    const t = 1 - this.windupTicks / WINDUP_TICKS;
    let armRot: number;
    let lean: number;
    let crouch: number;
    if (t < 0.45) {
      const k = t / 0.45;
      armRot = -2.4 * k;
      lean = -0.07 * k;
      crouch = 5 * k;
    } else if (t < 0.7) {
      armRot = -2.4; // set at the top
      lean = -0.07;
      crouch = 5;
    } else {
      const k = (t - 0.7) / 0.3;
      armRot = -2.4 + 3.1 * k; // snap through to the follow-through
      lean = -0.07 + 0.18 * k;
      crouch = 5 - 9 * k; // push off the rubber
    }
    if (this.pitcherArm) this.pitcherArm.rotation.x = armRot;
    if (this.pitcher3d) {
      this.pitcher3d.rotation.x = lean;
      this.pitcher3d.position.y = PITCHER_BASE_Y + crouch * 0.012;
    }

    if (this.windupTicks <= 0) {
      if (this.pitcherArmBall) this.pitcherArmBall.visible = false;
      this.startFlight(this.pendingPitch!);
      this.pendingPitch = null;
    }
  }

  /** Bat swing: cock back, sweep through the zone (horizontal Y rotation), hold. */
  private updateSwingAnimation(): void {
    if (this.swingTicks <= 0 || !this.batter3d || !this.batterBat) return;
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
    this.batterBat.rotation.y = dir * batAngle;
    this.batter3d.rotation.y = dir * lean;

    if (this.swingTicks === 0) {
      this.batterBat.rotation.y = 0;
      this.batter3d.rotation.y = 0;
    }
  }

  private updatePrepare(): void {
    if (this.currentBatterId !== this.batter.id) this.rebuildCharacters();
    this.msgText = "";
    this.speedTextStr = "";
    this.ball.visible = false;
    this.swing = null;
    this.swung = false;
    this.pitch = null;
    this.aim = { x: 0, y: 0 };
    this.aimRing.visible = false;
    this.pitchListData = null;

    // the batter can set up the swing spot before the pitch
    if (this.playerIsBatting) this.updateBattingCursor();
    else this.cursorRing.visible = false;

    if (this.timer > 0) {
      this.timer -= 1;
      this.refreshHud();
      return;
    }
    if (this.playerIsBatting) {
      // CPU throws after a beat
      this.intent = cpuSelectPitch(this.pitcher, this.state.balls, this.state.strikes, this.rng);
      this.beginWindup(throwPitch(this.pitcher, this.intent, this.rng));
    } else {
      this.pitchSel = 0;
      this.refreshPitchList();
      this.phase = "selectPitch";
    }
  }

  private arsenal(): PitchTypeId[] {
    return ["fastball", ...(this.pitcher.pitching?.breakingBalls.map((b) => b.type) ?? [])];
  }

  private refreshPitchList(): void {
    this.pitchListData = {
      names: this.arsenal().map((pt) => PITCH_NAMES[pt]),
      selected: this.pitchSel,
    };
    this.refreshHud();
  }

  private updateSelectPitch(): void {
    const inp = this.ctx.input;
    const n = this.arsenal().length;
    if (inp.justPressed("ArrowUp")) {
      this.pitchSel = (this.pitchSel + n - 1) % n;
      this.refreshPitchList();
    }
    if (inp.justPressed("ArrowDown")) {
      this.pitchSel = (this.pitchSel + 1) % n;
      this.refreshPitchList();
    }
    if (inp.justPressed("Space") || inp.justPressed("Enter")) {
      this.pitchListData = null;
      this.refreshHud();
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

    const w = this.zoneToWorld(this.aim.x, this.aim.y);
    this.aimRing.position.set(w.x, w.y, WORLD.zoneZ + 0.06);
    this.aimRing.visible = true;

    if (inp.justPressed("Space") || inp.justPressed("Enter")) {
      const pt = this.arsenal()[this.pitchSel] ?? "fastball";
      this.intent = { pitchType: pt, targetX: this.aim.x, targetY: this.aim.y };
      this.aimRing.visible = false;
      const pitch = throwPitch(this.pitcher, this.intent, this.rng);
      // CPU batter decides as the ball leaves the hand
      this.swing = cpuSwingDecision(
        this.batter,
        pitch,
        this.state.balls,
        this.state.strikes,
        this.rng,
      );
      this.beginWindup(pitch);
    }
  }

  private startFlight(pitch: PitchResult): void {
    this.pitch = pitch;
    this.flightT = 0;
    this.flightTime = 1.05 - pitch.speed * 0.45;
    this.flightStart.copy(WORLD.release);
    this.flightEnd.copy(this.zoneToWorld(pitch.x, pitch.y));
    const brk = pitchBreakVector(this.pitcher, pitch.pitchType);
    this.breakWorld = { x: brk.dx * BREAK_WORLD, y: brk.dy * BREAK_WORLD };
    this.flightTrace = [];
    this.pitchSeq += 1;
    this.phase = "flight";
    this.ball.visible = true;
    this.ball.position.copy(this.flightStart);
    this.speedTextStr = `${pitchSpeedKmh(this.pitcher, pitch.pitchType)} ${t("kmh")}`;
    this.refreshHud();
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

    const w = this.zoneToWorld(this.cursor.x, this.cursor.y);
    const r = cursorRadius(this.batter) * WORLD.zoneUnit * 0.78;
    this.cursorRing.position.set(w.x, w.y, WORLD.zoneZ + 0.06);
    this.cursorRing.scale.set(r / 0.16, (r * 0.85) / 0.16, 1);
    this.cursorRing.visible = true;
  }

  private updateFlight(): void {
    const inp = this.ctx.input;

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
    const start = this.flightStart;
    const end = this.flightEnd;
    // the ball travels straight toward where it would cross without movement, and
    // the break bends it onto the real location late (k²); fastballs have zero
    // break and fly true. Perspective grows the ball as it nears the camera.
    const brk = this.breakWorld;
    const late = k * k;
    const bx = start.x + (end.x - brk.x - start.x) * k + brk.x * late;
    const by = start.y + (end.y - brk.y - start.y) * k + brk.y * late;
    const bz = start.z + (end.z - start.z) * k;
    this.ball.position.set(bx, by, bz);
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
    const ev = resolvePitch(this.batter, this.pitch!, this.swing, this.rng);
    const play = applyPitch(this.state, ev);
    this.lastPlay = play;
    this.cursorRing.visible = false;

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
    this.msgText = text;
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
    const visible = this.ball.visible;
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
      ballX: visible ? this.ball.position.x : null,
      ballY: visible ? this.ball.position.y : null,
      pitchSeq: this.pitchSeq,
      flightTrace: [...this.flightTrace],
      gameOver: this.state.gameOver,
      lastPlay: this.lastPlay,
    };
  }
}
