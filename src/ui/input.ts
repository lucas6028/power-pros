/** Keyboard state for the fixed-timestep loop. justPressed is true for exactly
 * one logic tick. Also accepts synthetic presses from the dev debug API. */
export class Input {
  private down = new Set<string>();
  private pressedBuffer = new Set<string>();
  private pressedThisTick = new Set<string>();

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressedBuffer.add(e.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.down.delete(e.code));
  }

  /** Called once at the start of each logic tick. */
  beginTick(): void {
    this.pressedThisTick = this.pressedBuffer;
    this.pressedBuffer = new Set();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  justPressed(code: string): boolean {
    return this.pressedThisTick.has(code);
  }

  /** Synthetic key press (debug API / tests). */
  inject(code: string, holdTicks = 1): void {
    this.pressedBuffer.add(code);
    this.down.add(code);
    if (holdTicks > 0) {
      window.setTimeout(() => this.down.delete(code), (holdTicks * 1000) / 60);
    }
  }

  release(code: string): void {
    this.down.delete(code);
  }
}
