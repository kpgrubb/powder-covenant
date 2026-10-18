/**
 * Camera + Canvas 2D renderer. Draws from a Scene snapshot of read-only
 * references; never mutates game state. Every drawable names a visual key in
 * visuals.json: placeholder shapes, single sprites, four-direction sheet
 * sprites, tiled cover blocks, and a cached floor. Swapping art is data.
 */
import { clamp, lerp, Rng, type Rect, type Vec2 } from '../core/math';
import type { Tuning } from '../core/tuning';
import type { VisualDef } from '../core/types';
import type { Arena } from '../world/arena';
import type { Player } from '../entities/player';
import type { Enemy, Pickup } from '../enemies/enemy';
import type { Projectile } from '../weapons/projectiles';
import type { SwingVisual } from '../weapons/melee';
import type { Feedback } from '../fx/feedback';

export class Camera {
  x: number;
  y: number;
  constructor(public readonly w: number, public readonly h: number, start: Vec2) {
    this.x = start.x;
    this.y = start.y;
  }
  follow(target: Vec2, dt: number, bounds: Rect): void {
    const k = 1 - Math.pow(0.001, dt);
    this.x = lerp(this.x, target.x, k);
    this.y = lerp(this.y, target.y, k);
    this.x = clamp(this.x, bounds.x + this.w / 2, bounds.x + bounds.w - this.w / 2);
    this.y = clamp(this.y, bounds.y + this.h / 2, bounds.y + bounds.h - this.h / 2);
  }
  toWorld(sx: number, sy: number): Vec2 { return { x: sx + this.x - this.w / 2, y: sy + this.y - this.h / 2 }; }
}

export interface Scene {
  player: Player;
  enemies: readonly Enemy[];
  pickups: readonly Pickup[];
  projectiles: readonly Projectile[];
  swings: readonly SwingVisual[];
  feedback: Feedback;
  cursedArmed: boolean;
}

type Dir = 'right' | 'left' | 'down' | 'up';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  readonly camera: Camera;
  private images = new Map<string, HTMLImageElement>();
  private floorCache: HTMLCanvasElement | null = null;
  private floorKey = '';
  private tint: HTMLCanvasElement;
  private cell: number;

  constructor(canvas: HTMLCanvasElement, private tuning: Tuning, private arena: Arena, start: Vec2) {
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.camera = new Camera(canvas.width, canvas.height, start);
    this.cell = arena.tileSize;
    this.tint = document.createElement('canvas');
    this.tint.width = this.tint.height = 96;
  }

  private visual(key: string): VisualDef {
    return this.tuning.data.visuals[key] ?? { type: 'shape', shape: 'circle', color: '#ff00ff', size: 16 };
  }

  /** Lazy-load an image under public/sprites (sheet) or an explicit src. Null until loaded. */
  private image(path: string): HTMLImageElement | null {
    let img = this.images.get(path);
    if (!img) {
      img = new Image();
      img.src = path;
      img.onload = () => { if (path.includes('/')) this.floorCache = null; };
      this.images.set(path, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  private sheet(name: string): HTMLImageElement | null { return this.image(`sprites/${name}.png`); }

  /** Source rect of a tile visual (first block cell if `cellIndex` given). */
  private tileSource(v: VisualDef, ci = 0, ri = 0): { img: HTMLImageElement; sx: number; sy: number; sw: number; sh: number } | null {
    if (!v.sheet) return null;
    const img = this.sheet(v.sheet);
    if (!img) return null;
    if (v.px !== undefined && v.py !== undefined) return { img, sx: v.px, sy: v.py, sw: v.pw ?? this.cell, sh: v.ph ?? this.cell };
    const c = this.cell;
    return { img, sx: ((v.col ?? 0) + ci) * c, sy: ((v.row ?? 0) + ri) * c, sw: c, sh: c };
  }

  /** Tile a block visual across a world rect, cell by cell, optional 90° rotations. */
  private drawTiled(v: VisualDef, r: Rect): boolean {
    const c = this.cell;
    const bc = v.cols ?? 1;
    const br = v.rows ?? 1;
    const ctx = this.ctx;
    const nx = Math.max(1, Math.round(r.w / c));
    const ny = Math.max(1, Math.round(r.h / c));
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const src = this.tileSource(v, i % bc, j % br);
        if (!src) return false;
        const dx = r.x + i * c;
        const dy = r.y + j * c;
        if (v.rotate) {
          ctx.save();
          ctx.translate(dx + c / 2, dy + c / 2);
          ctx.rotate((v.rotate * Math.PI) / 180);
          ctx.drawImage(src.img, src.sx, src.sy, src.sw, src.sh, -c / 2, -c / 2, c, c);
          ctx.restore();
        } else {
          ctx.drawImage(src.img, src.sx, src.sy, src.sw, src.sh, dx, dy, c, c);
        }
      }
    }
    return true;
  }

  private dirFor(angle: number): Dir {
    const a = Math.atan2(Math.sin(angle), Math.cos(angle));
    const q = Math.PI / 4;
    if (a > -q && a <= q) return 'right';
    if (a > q && a <= 3 * q) return 'down';
    if (a > -3 * q && a <= -q) return 'up';
    return 'left';
  }

  /** Draw an entity visual centred at (x, y) with a facing angle. */
  private drawEntity(key: string, x: number, y: number, angle: number, opts: { flash?: boolean; alpha?: number; tint?: string } = {}): void {
    const v = this.visual(key);
    const ctx = this.ctx;
    const size = v.size ?? 24;
    ctx.save();
    ctx.globalAlpha = opts.alpha ?? 1;

    if (v.type === 'sprite4' && v.sheet && v.dirs) {
      const img = this.sheet(v.sheet);
      if (img) {
        const dir = this.dirFor(angle);
        let cell = v.dirs[dir];
        let flip = false;
        if (cell === 'flip') { cell = v.dirs.right; flip = true; }
        const c = this.cell;
        const [col, row] = cell as [number, number];
        if (v.shadow !== false) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath();
          ctx.ellipse(x, y + size * 0.42, size * 0.3, size * 0.12, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.translate(x, y);
        if (flip) ctx.scale(-1, 1);
        const d = -size / 2;
        if (opts.flash || opts.tint) {
          const t = this.tint.getContext('2d')!;
          t.clearRect(0, 0, size, size);
          t.imageSmoothingEnabled = false;
          t.globalCompositeOperation = 'source-over';
          t.drawImage(img, col * c, row * c, c, c, 0, 0, size, size);
          t.globalCompositeOperation = 'source-atop';
          t.fillStyle = opts.flash ? 'rgba(255,255,255,0.85)' : (opts.tint ?? 'rgba(0,0,0,0)');
          t.fillRect(0, 0, size, size);
          ctx.drawImage(this.tint, 0, 0, size, size, d, d, size, size);
        } else {
          ctx.drawImage(img, col * c, row * c, c, c, d, d, size, size);
        }
        ctx.restore();
        if (v.facing) this.aimLine(x, y, angle, size, v.facingColor ?? '#fff');
        return;
      }
    }

    if (v.type === 'sprite' && v.src) {
      const img = this.image(v.src);
      if (img) {
        const fw = v.frameW ?? img.width;
        const fh = v.frameH ?? img.height;
        ctx.translate(x, y);
        if (v.facing) ctx.rotate(angle);
        ctx.drawImage(img, 0, 0, fw, fh, -size / 2, -size / 2, size, size);
        ctx.restore();
        if (opts.flash) this.flashCircle(x, y, size / 2);
        return;
      }
    }

    // placeholder shape (also the fallback while a sheet is still loading)
    ctx.fillStyle = opts.flash ? '#ffffff' : (opts.tint ?? v.color ?? '#f0f');
    ctx.strokeStyle = v.outline ?? '#000';
    ctx.lineWidth = 2;
    const s = v.type === 'shape' ? size : Math.min(size, 24);
    if (v.shape === 'rect') {
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, s / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    if (v.facing) this.aimLine(x, y, angle, s, v.facingColor ?? '#fff');
  }

  private aimLine(x: number, y: number, angle: number, size: number, color: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * (size / 2 - 4), y + Math.sin(angle) * (size / 2 - 4));
    ctx.lineTo(x + Math.cos(angle) * (size / 2 + 8), y + Math.sin(angle) * (size / 2 + 8));
    ctx.stroke();
    ctx.restore();
  }

  private flashCircle(x: number, y: number, r: number): void {
    this.ctx.save();
    this.ctx.globalAlpha = 0.8;
    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  /** Render the whole floor once into an offscreen canvas; redraw only if visuals change. */
  private floor(): HTMLCanvasElement | null {
    const v = this.visual('floor');
    const key = JSON.stringify(v) + this.arena.width + 'x' + this.arena.height;
    if (this.floorCache && this.floorKey === key) return this.floorCache;
    if (v.type !== 'floor' || !v.base) return null;
    const base = this.visual(v.base);
    const patches = (v.patches ?? []).map((p) => ({ v: this.visual(p.visual), w: p.weight }));
    if (!this.tileSource(base)) return null;
    for (const p of patches) if (!this.tileSource(p.v)) return null;
    const cv = document.createElement('canvas');
    cv.width = this.arena.width;
    cv.height = this.arena.height;
    const saved = this.ctx;
    this.ctx = cv.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    const rng = new Rng(v.seed ?? 1);
    const c = this.cell;
    for (let r = 0; r < this.arena.rows; r++) {
      for (let col = 0; col < this.arena.cols; col++) {
        let pick = base;
        const roll = rng.next();
        let acc = 0;
        for (const p of patches) { acc += p.w; if (roll < acc) { pick = p.v; break; } }
        this.drawTiled(pick, { x: col * c, y: r * c, w: c, h: c });
      }
    }
    this.ctx = saved;
    this.floorCache = cv;
    this.floorKey = key;
    return cv;
  }

  draw(scene: Scene): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const fb = scene.feedback;
    const flags = this.tuning.flags;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0a0c';
    ctx.fillRect(0, 0, cam.w, cam.h);
    const ox = Math.round(-cam.x + cam.w / 2 + fb.shakeX);
    const oy = Math.round(-cam.y + cam.h / 2 + fb.shakeY);
    ctx.setTransform(1, 0, 0, 1, ox, oy);

    // floor
    const ts = this.cell;
    const x0 = Math.max(0, Math.floor((cam.x - cam.w / 2) / ts) * ts);
    const x1 = Math.min(this.arena.width, cam.x + cam.w / 2 + ts);
    const y0 = Math.max(0, Math.floor((cam.y - cam.h / 2) / ts) * ts);
    const y1 = Math.min(this.arena.height, cam.y + cam.h / 2 + ts);
    const floorImg = this.floor();
    if (floorImg) {
      ctx.drawImage(floorImg, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    } else {
      const fv = this.visual('floor');
      ctx.fillStyle = fv.color ?? '#1a1714';
      ctx.fillRect(0, 0, this.arena.width, this.arena.height);
      ctx.strokeStyle = fv.line ?? '#221e1a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += ts) { ctx.moveTo(x + 0.5, y0); ctx.lineTo(x + 0.5, y1); }
      for (let y = y0; y <= y1; y += ts) { ctx.moveTo(x0, y + 0.5); ctx.lineTo(x1, y + 0.5); }
      ctx.stroke();
    }
    ctx.strokeStyle = '#3a332e';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, this.arena.width, this.arena.height);

    // cover
    for (const c of this.arena.covers) {
      const v = this.visual(c.visual ?? c.rules.visual);
      if (v.type === 'tile' && this.drawTiled(v, c.rect)) continue;
      ctx.fillStyle = v.color ?? '#555';
      ctx.fillRect(c.rect.x, c.rect.y, c.rect.w, c.rect.h);
      if (v.pattern === 'stripes') {
        ctx.strokeStyle = v.outline ?? '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = c.rect.x + 8; x < c.rect.x + c.rect.w; x += 12) { ctx.moveTo(x, c.rect.y); ctx.lineTo(x, c.rect.y + c.rect.h); }
        ctx.stroke();
      }
      ctx.strokeStyle = v.outline ?? '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(c.rect.x, c.rect.y, c.rect.w, c.rect.h);
    }

    if (flags.showCoverSpots) {
      ctx.fillStyle = 'rgba(100, 200, 255, 0.5)';
      for (const s of this.arena.coverSpots) ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }

    // pickups
    for (const p of scene.pickups) {
      const bob = Math.sin(p.age * 4) * 2;
      this.drawEntity(p.visual, p.x, p.y + bob, 0);
    }

    // swings
    for (const s of scene.swings) {
      const v = this.visual('slash');
      const t = s.age / s.life;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = v.color ?? '#fff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.range * (0.6 + 0.4 * t), s.angle - s.arc / 2, s.angle + s.arc / 2);
      ctx.stroke();
      ctx.restore();
    }

    // projectiles
    for (const p of scene.projectiles) {
      if (!p.alive) continue;
      const v = this.visual(p.visual);
      const size = v.size ?? 4;
      const trail = v.trail ?? 8;
      const len = Math.hypot(p.vx, p.vy) || 1;
      ctx.strokeStyle = v.color ?? '#ff0';
      ctx.lineWidth = size * 0.6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - (p.vx / len) * trail, p.y - (p.vy / len) * trail);
      ctx.stroke();
      ctx.fillStyle = v.color ?? '#ff0';
      ctx.beginPath();
      ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // characters, y-sorted so a soldier below overlaps one above
    const chars: Array<{ y: number; draw: () => void }> = [];
    for (const e of scene.enemies) {
      if (!e.alive) continue;
      chars.push({ y: e.pos.y, draw: () => {
        this.drawEntity(e.def.visual, e.pos.x, e.pos.y, e.facing, { flash: e.hitFlash > 0, tint: e.status.burn ? 'rgba(176,108,255,0.45)' : undefined });
        if (e.health < e.maxHealth) {
          const w = 26;
          ctx.fillStyle = '#000';
          ctx.fillRect(e.pos.x - w / 2, e.pos.y - 30, w, 4);
          ctx.fillStyle = '#b8322f';
          ctx.fillRect(e.pos.x - w / 2, e.pos.y - 30, w * Math.max(0, e.health / e.maxHealth), 4);
        }
        if (flags.aiDebug) {
          ctx.save();
          ctx.globalAlpha = 0.15;
          ctx.fillStyle = e.canSee ? '#ff5555' : '#ffffaa';
          ctx.beginPath();
          ctx.moveTo(e.pos.x, e.pos.y);
          ctx.arc(e.pos.x, e.pos.y, e.def.visionRange, e.facing - (e.def.visionCone / 2) * Math.PI / 180, e.facing + (e.def.visionCone / 2) * Math.PI / 180);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          if (e.spot) {
            ctx.strokeStyle = 'rgba(100,200,255,0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(e.pos.x, e.pos.y);
            ctx.lineTo(e.spot.x, e.spot.y);
            ctx.stroke();
          }
          ctx.fillStyle = '#fff';
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(e.state, e.pos.x, e.pos.y + 32);
        }
      } });
    }
    const pl = scene.player;
    if (pl.alive) {
      chars.push({ y: pl.pos.y, draw: () => {
        const alpha = pl.dodge.active ? 0.55 : 1;
        this.drawEntity(pl.def.visual, pl.pos.x, pl.pos.y, pl.aim, { flash: pl.hitFlash > 0, alpha });
        if (pl.invulnerable) {
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(pl.pos.x, pl.pos.y, pl.def.radius + 8, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (scene.cursedArmed) {
          const v = this.visual('curse_glow');
          ctx.strokeStyle = v.color ?? '#b06cff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pl.pos.x, pl.pos.y, (v.size ?? 30) / 2 + Math.sin(performance.now() / 120) * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      } });
    }
    chars.sort((a, b) => a.y - b.y);
    for (const c of chars) c.draw();

    // fx
    for (const f of fb.flashes) {
      const t = 1 - f.age / f.life;
      ctx.save();
      ctx.globalAlpha = t;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x + Math.cos(f.angle) * f.size, f.y + Math.sin(f.angle) * f.size);
      ctx.stroke();
      ctx.restore();
    }
    for (const p of fb.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const r of fb.rings) {
      const t = r.age / r.life;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * (0.3 + 0.7 * t), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    for (const n of fb.numbers) {
      ctx.globalAlpha = 1 - n.age / n.life;
      ctx.fillStyle = '#000';
      ctx.fillText(n.text, n.x + 1, n.y + 1);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, n.x, n.y);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
