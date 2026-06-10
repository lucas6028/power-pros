import { Application, Container } from "pixi.js";
import { GAME_W, GAME_H, SceneManager } from "./scenes/scene";
import { TitleScene } from "./scenes/TitleScene";
import { TeamSelectScene } from "./scenes/TeamSelectScene";
import { GameScene } from "./scenes/GameScene";
import { ResultScene } from "./scenes/ResultScene";
import { Input } from "./ui/input";
import { installDebugApi } from "./ui/debug";

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
  document.body.appendChild(app.canvas);

  // letterbox-scale the fixed logical resolution to the window
  const fit = (): void => {
    const scale = Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H);
    app.canvas.style.width = `${Math.floor(GAME_W * scale)}px`;
    app.canvas.style.height = `${Math.floor(GAME_H * scale)}px`;
  };
  fit();
  window.addEventListener("resize", fit);

  const stage = new Container();
  app.stage.addChild(stage);

  const input = new Input();
  const scenes = new SceneManager(stage, input);
  scenes.register(new TitleScene());
  scenes.register(new TeamSelectScene());
  scenes.register(new GameScene());
  scenes.register(new ResultScene());
  scenes.goTo("title");

  if (import.meta.env.DEV) {
    installDebugApi(scenes, input);
  }

  // fixed-timestep logic at 60 Hz; input timing is gameplay-critical
  let accumulator = 0;
  app.ticker.add((ticker) => {
    accumulator += Math.min(ticker.deltaMS / 1000, MAX_FRAME);
    while (accumulator >= LOGIC_DT) {
      input.beginTick();
      scenes.update(LOGIC_DT);
      accumulator -= LOGIC_DT;
    }
  });
}

void boot();
