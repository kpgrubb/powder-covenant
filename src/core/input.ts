/**
 * Keyboard + mouse snapshot. Systems poll `down`/`pressed` each tick;
 * `pressed` is true only on the tick a key went down. `inject*` methods let
 * Playwright and tests drive input without real events.
 */
export class Input {
  private held = new Set<string>();
  private justPressed = new Set<string>();
  private consumed = new Set<string>();
  /** Mouse position in internal-canvas pixels. */
  mouse = { x: 480, y: 270 };
  mouseDown = false;
  private mouseJust = false;

  constructor(private canvas: HTMLCanvasElement | null) {
    if (!canvas) return;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.press(e.code);
      if (e.code === 'Space' || e.code === 'Tab' || e.code === 'Backquote') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.release(e.code));
    window.addEventListener('blur', () => { this.held.clear(); this.mouseDown = false; });
    canvas.addEventListener('mousemove', (e) => this.setMouseFromClient(e.clientX, e.clientY));
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { this.mouseDown = true; this.mouseJust = true; } });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private setMouseFromClient(cx: number, cy: number): void {
    if (!this.canvas) return;
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = ((cx - r.left) / r.width) * this.canvas.width;
    this.mouse.y = ((cy - r.top) / r.height) * this.canvas.height;
  }

  press(code: string): void {
    if (!this.held.has(code)) this.justPressed.add(code);
    this.held.add(code);
  }
  release(code: string): void { this.held.delete(code); }

  /** Test/automation helpers. */
  injectMouse(x: number, y: number): void { this.mouse.x = x; this.mouse.y = y; }
  injectMouseDown(down: boolean): void { if (down && !this.mouseDown) this.mouseJust = true; this.mouseDown = down; }

  down(code: string): boolean { return this.held.has(code); }
  pressed(code: string): boolean {
    if (this.justPressed.has(code) && !this.consumed.has(code)) { this.consumed.add(code); return true; }
    return false;
  }
  firePressed(): boolean { const v = this.mouseJust; this.mouseJust = false; return v; }

  /** Call at the end of each tick. */
  endTick(): void {
    this.justPressed.clear();
    this.consumed.clear();
    this.mouseJust = false;
  }
}
