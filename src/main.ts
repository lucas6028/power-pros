import { Application, Container } from "pixi.js";
import { GAME_W, GAME_H, SceneManager } from "./scenes/scene";
import { TitleScene } from "./scenes/TitleScene";
import { TeamSelectScene } from "./scenes/TeamSelectScene";
import { GameScene } from "./scenes/GameScene";
import { ResultScene } from "./scenes/ResultScene";
import { Input } from "./ui/input";
import { installDebugApi } from "./ui/debug";
import { ThreeStage } from "./render/three-stage";

const LOGIC_HZ = 60;
const LOGIC_DT = 1 / LOGIC_HZ;
const MAX_FRAME = 0.25; // clamp huge tab-switch deltas

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({
    width: GAME_W,
    height: GAME_H,
    background: 0x1a1a2e,
    antialias: true,
  });
  app.canvas.style.position = "absolute";
  document.body.appendChild(app.canvas);

  // WebGL host for the 3D game scene + its DOM HUD overlay, layered above Pixi
  const three = new ThreeStage();
  document.body.appendChild(three.renderer.domElement);
  document.body.appendChild(three.overlay);

  // letterbox-scale the fixed logical resolution to the window; the Pixi canvas,
  // the WebGL canvas, and the HUD overlay all share the exact same rect
  const fit = (): void => {
    const scale = Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H);
    const w = Math.floor(GAME_W * scale);
    const h = Math.floor(GAME_H * scale);
    const left = Math.floor((window.innerWidth - w) / 2);
    const top = Math.floor((window.innerHeight - h) / 2);
    app.canvas.style.left = `${left}px`;
    app.canvas.style.top = `${top}px`;
    app.canvas.style.width = `${w}px`;
    app.canvas.style.height = `${h}px`;
    three.layout(left, top, w, h);
  };
  fit();
  window.addEventListener("resize", fit);

  const stage = new Container();
  app.stage.addChild(stage);

  const input = new Input();
  const scenes = new SceneManager(stage, three, input);
  scenes.register(new TitleScene());
  scenes.register(new TeamSelectScene());
  scenes.register(new GameScene());
  scenes.register(new ResultScene());
  scenes.goTo("title");

  let timeScale = 1;
  if (import.meta.env.DEV) {
    installDebugApi(scenes, input, (s) => {
      timeScale = s;
    });
  }

  // fixed-timestep logic at 60 Hz; input timing is gameplay-critical
  let accumulator = 0;
  app.ticker.add((ticker) => {
    accumulator += Math.min(ticker.deltaMS / 1000, MAX_FRAME) * timeScale;
    while (accumulator >= LOGIC_DT) {
      input.beginTick();
      scenes.update(LOGIC_DT);
      accumulator -= LOGIC_DT;
    }
    // 3D scenes drive their own WebGL renderer once per animation frame
    scenes.currentScene?.render?.();
  });
}

void boot();
