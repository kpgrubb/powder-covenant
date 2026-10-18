/**
 * Camera + Canvas 2D renderer. Draws from a Scene snapshot of read-only
 * references; never mutates game state. Every drawable names a visual key in
 * visuals.json, so swapping placeholder shapes for sprites is a data change.
 */
import { clamp, lerp, type Rect, type Vec2 } from '../core/math';
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

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  readonly camera: Camera;
  private sprites = new Map<string, HTMLImageElement>();

  constructor(canvas: HTMLCanvasElement, private tuning: Tuning, private arena: Arena, start: Vec2) {
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.camera = new Camera(canvas.width, canvas.height, start);
  }

  private visual(key: string): VisualDef {
    return this.tuning.data.visuals[key] ?? { type: 'shape', shape: 'circle', color: '#ff00ff', size: 16 };
  }

  private sprite(src: string): HTMLImageElement | null {
    let img = this.sprites.get(src);
    if (!img) {
      img = new Image();
      img.src = src;
      this.sprites.set(src, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  /** Draw an entity visual centred at (x, y) with a facing angle. */
  private drawEntity(key: string, x: number, y: number, angle: number, opts: { flash?: boolean; alpha?: number; tint?: string } = {}): void {
    const v = this.visual(key);
    const ctx = this.ctx;
    const size = v.size ?? 24;
    ctx.save();
    ctx.globalAlpha = opts.alpha ?? 1;
    if (v.type === 'sprite' && v.src) {
      const img = this.sprite(v.src);
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
    ctx.fillStyle = opts.flash ? '#ffffff' : (opts.tint ?? v.color ?? '#f0f');
    ctx.strokeStyle = v.outline ?? '#000';
    ctx.lineWidth = 2;
    if (v.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    }
    if (v.facing) {
      ctx.strokeStyle = v.facingColor ?? '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * (size / 2 - 4), y + Math.sin(angle) * (size / 2 - 4));
      ctx.lineTo(x + Math.cos(angle) * (size / 2 + 8), y + Math.sin(angle) * (size / 2 + 8));
      ctx.stroke();
    }
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
    const floor = this.visual('floor');
    ctx.fillStyle = floor.color ?? '#1a1714';
    ctx.fillRect(0, 0, this.arena.width, this.arena.height);
    ctx.strokeStyle = floor.line ?? '#221e1a';
    ctx.lineWidth = 1;
    const ts = this.arena.tileSize;
    const x0 = Math.max(0, Math.floor((cam.x - cam.w / 2) / ts) * ts);
    const x1 = Math.min(this.arena.width, cam.x + cam.w / 2 + ts);
    const y0 = Math.max(0, Math.floor((cam.y - cam.h / 2) / ts) * ts);
    const y1 = Math.min(this.arena.height, cam.y + cam.h / 2 + ts);
    ctx.beginPath();
    for (let x = x0; x <= x1; x += ts) { ctx.moveTo(x + 0.5, y0); ctx.lineTo(x + 0.5, y1); }
    for (let y = y0; y <= y1; y += ts) { ctx.moveTo(x0, y + 0.5); ctx.lineTo(x1, y + 0.5); }
    ctx.stroke();
    // arena edge
    ctx.strokeStyle = '#3a332e';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, this.arena.width, this.arena.height);

    // cover
    for (const c of this.arena.covers) {
      const v = this.visual(c.rules.visual);
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

    // enemies
    for (const e of scene.enemies) {
      if (!e.alive) continue;
      this.drawEntity(e.def.visual, e.pos.x, e.pos.y, e.facing, { flash: e.hitFlash > 0, tint: e.status.burn ? '#8a5aa0' : undefined });
      // health pip
      if (e.health < e.maxHealth) {
        const w = 26;
        ctx.fillStyle = '#000';
        ctx.fillRect(e.pos.x - w / 2, e.pos.y - 22, w, 4);
        ctx.fillStyle = '#b8322f';
        ctx.fillRect(e.pos.x - w / 2, e.pos.y - 22, w * Math.max(0, e.health / e.maxHealth), 4);
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
        ctx.fillText(e.state, e.pos.x, e.pos.y + 26);
      }
    }

    // player
    const pl = scene.player;
    if (pl.alive) {
      const alpha = pl.dodge.active ? 0.55 : 1;
      this.drawEntity(pl.def.visual, pl.pos.x, pl.pos.y, pl.aim, { flash: pl.hitFlash > 0, alpha });
      if (pl.invulnerable) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pl.pos.x, pl.pos.y, pl.def.radius + 5, 0, Math.PI * 2);
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
    }

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
