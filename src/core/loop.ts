/**
 * Fixed-timestep game loop. Simulation ticks at a constant rate so physics
 * and weapon timers are deterministic; rendering happens once per animation
 * frame. `step(dt)` is public so tests and Playwright can drive the sim
 * without requestAnimationFrame.
 */
export interface LoopHooks {
  update: (dt: number) => void;
  render: (alpha: number) => void;
}

export class GameLoop {
  readonly stepSize: number;
  private acc = 0;
  private last = 0;
  private raf = 0;
  running = false;
  /** Rolling FPS estimate for the status readout. */
  fps = 0;
  private frames = 0;
  private fpsClock = 0;

  constructor(private hooks: LoopHooks, hz = 60) {
    this.stepSize = 1 / hz;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      let frame = (now - this.last) / 1000;
      this.last = now;
      if (frame > 0.25) frame = 0.25; // tab was hidden; don't spiral
      this.acc += frame;
      while (this.acc >= this.stepSize) {
        this.hooks.update(this.stepSize);
        this.acc -= this.stepSize;
      }
      this.hooks.render(this.acc / this.stepSize);
      this.frames++;
      this.fpsClock += frame;
      if (this.fpsClock >= 0.5) {
        this.fps = Math.round(this.frames / this.fpsClock);
        this.frames = 0;
        this.fpsClock = 0;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Advance the simulation by `seconds` in fixed steps, no rendering. */
  step(seconds: number): void {
    let remaining = seconds;
    while (remaining > 1e-9) {
      const dt = Math.min(this.stepSize, remaining);
      this.hooks.update(dt);
      remaining -= dt;
    }
  }
}
