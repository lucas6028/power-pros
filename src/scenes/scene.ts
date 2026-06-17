import { Container } from "pixi.js";
import type { Input } from "../ui/input";
import type { ThreeStage } from "../render/three-stage";

export const GAME_W = 960;
export const GAME_H = 540;

export interface SceneContext {
  /** Pixi stage for 2D scenes (menus). */
  stage: Container;
  /** WebGL host + DOM overlay for 3D scenes (the game). */
  three: ThreeStage;
  /** DOM overlay root layered over the WebGL canvas (HUD lives here). */
  overlay: HTMLElement;
  input: Input;
  goTo(scene: string, params?: unknown): void;
}

export interface Scene {
  readonly name: string;
  /** Build display objects and add them to ctx.stage (2D) or ctx.three (3D). */
  enter(ctx: SceneContext, params?: unknown): void;
  /** Remove and destroy display objects. */
  exit(): void;
  /** One 60 Hz logic tick. */
  update(dt: number): void;
  /** Optional per-frame render hook for scenes that drive their own renderer (3D). */
  render?(): void;
  /** Optional debug snapshot for tests. */
  debugState?(): Record<string, unknown>;
}

export class SceneManager {
  private scenes = new Map<string, Scene>();
  private current: Scene | null = null;
  private pendingSwitch: { name: string; params?: unknown } | null = null;

  constructor(
    private stage: Container,
    private three: ThreeStage,
    private input: Input,
  ) {}

  register(scene: Scene): void {
    this.scenes.set(scene.name, scene);
  }

  goTo(name: string, params?: unknown): void {
    this.pendingSwitch = { name, params };
  }

  get currentName(): string {
    return this.current?.name ?? "none";
  }

  get currentScene(): Scene | null {
    return this.current;
  }

  update(dt: number): void {
    if (this.pendingSwitch) {
      const { name, params } = this.pendingSwitch;
      this.pendingSwitch = null;
      const next = this.scenes.get(name);
      if (!next) throw new Error(`unknown scene: ${name}`);
      this.current?.exit();
      this.current = next;
      next.enter(
        {
          stage: this.stage,
          three: this.three,
          overlay: this.three.overlay,
          input: this.input,
          goTo: (n, p) => this.goTo(n, p),
        },
        params,
      );
    }
    this.current?.update(dt);
  }
}
