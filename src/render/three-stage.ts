import * as THREE from "three";
import { GAME_W, GAME_H } from "../scenes/scene";

/** Hosts the WebGL renderer shared by 3D scenes (currently just GameScene) and a
 * DOM overlay layered on top for crisp HTML/CSS HUD text. A 3D scene calls
 * `activate(scene, camera)` on enter and `deactivate()` on exit; the host renders
 * the active scene each animation frame and projects world points to the fixed
 * GAME_W×GAME_H pixel space so screenshot/trajectory tests stay stable. */
export class ThreeStage {
  readonly renderer: THREE.WebGLRenderer;
  /** DOM layer for the HUD; sized/positioned by main's fit() to match the canvas. */
  readonly overlay: HTMLDivElement;

  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(GAME_W, GAME_H, false);
    this.renderer.setClearColor(0x9adcf0, 1);
    const c = this.renderer.domElement;
    c.style.display = "none";
    c.style.position = "absolute";

    this.overlay = document.createElement("div");
    this.overlay.style.position = "absolute";
    this.overlay.style.display = "none";
    this.overlay.style.transformOrigin = "top left";
    this.overlay.style.pointerEvents = "none";
    this.overlay.style.overflow = "hidden";
    this.overlay.style.width = `${GAME_W}px`;
    this.overlay.style.height = `${GAME_H}px`;
  }

  /** Place the canvas + overlay over the same letterboxed rect main uses for Pixi. */
  layout(left: number, top: number, width: number, height: number): void {
    const c = this.renderer.domElement;
    c.style.left = `${left}px`;
    c.style.top = `${top}px`;
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    this.overlay.style.left = `${left}px`;
    this.overlay.style.top = `${top}px`;
    // overlay is authored at GAME_W×GAME_H and scaled to fit the displayed rect
    this.overlay.style.transform = `scale(${width / GAME_W}, ${height / GAME_H})`;
  }

  activate(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.scene = scene;
    this.camera = camera;
    this.renderer.domElement.style.display = "block";
    this.overlay.style.display = "block";
  }

  deactivate(): void {
    this.scene = null;
    this.camera = null;
    this.renderer.domElement.style.display = "none";
    this.overlay.style.display = "none";
    this.overlay.replaceChildren();
  }

  render(): void {
    if (this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  }

  /** World point → GAME_W×GAME_H pixel coordinates (origin top-left), matching the
   * 2D screen space the old Pixi renderer used so flightTrace/ballX stay comparable. */
  project(v: THREE.Vector3): { x: number; y: number } {
    if (!this.camera) return { x: 0, y: 0 };
    const ndc = v.clone().project(this.camera);
    return {
      x: (ndc.x * 0.5 + 0.5) * GAME_W,
      y: (-ndc.y * 0.5 + 0.5) * GAME_H,
    };
  }
}
