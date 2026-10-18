/**
 * Projectile pool. Moves rounds, swept-collides them against cover and the
 * opposing team, and reports via events. Knows nothing about Player or
 * Enemy classes: targets come from the registry, damage is applied by whoever
 * owns the target when they hear `hit`.
 */
import type { EventBus, StatusKind, Team } from '../core/events';
import { segmentCircle, type Vec2 } from '../core/math';
import type { TargetRegistry } from '../entities/combatant';
import type { Arena } from '../world/arena';

export interface Projectile {
  alive: boolean;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  origin: Vec2;
  team: Team;
  ownerId: number;
  damage: number;
  range: number;
  traveled: number;
  knockback: number;
  status?: StatusKind;
  visual: string;
  /** Seconds since death, for a brief fade. */
  dead: number;
}

export interface SpawnShot {
  x: number;
  y: number;
  angle: number;
  speed: number;
  damage: number;
  range: number;
  knockback: number;
  team: Team;
  ownerId: number;
  visual: string;
  status?: StatusKind;
}

export class ProjectileSystem {
  readonly list: Projectile[] = [];

  constructor(private bus: EventBus, private arena: Arena, private targets: TargetRegistry) {}

  spawn(s: SpawnShot): Projectile {
    let p = this.list.find((q) => !q.alive && q.dead > 0.2);
    if (!p) {
      p = { alive: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, origin: { x: 0, y: 0 }, team: 'player', ownerId: 0, damage: 0, range: 0, traveled: 0, knockback: 0, visual: '', dead: 0 };
      this.list.push(p);
    }
    p.alive = true;
    p.dead = 0;
    p.x = p.px = s.x;
    p.y = p.py = s.y;
    p.vx = Math.cos(s.angle) * s.speed;
    p.vy = Math.sin(s.angle) * s.speed;
    p.origin = { x: s.x, y: s.y };
    p.team = s.team;
    p.ownerId = s.ownerId;
    p.damage = s.damage;
    p.range = s.range;
    p.traveled = 0;
    p.knockback = s.knockback;
    p.status = s.status;
    p.visual = s.visual;
    return p;
  }

  get liveCount(): number { return this.list.filter((p) => p.alive).length; }

  clear(): void { this.list.length = 0; }

  update(dt: number): void {
    for (const p of this.list) {
      if (!p.alive) { p.dead += dt; continue; }
      p.px = p.x;
      p.py = p.y;
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      const stepLen = Math.hypot(nx - p.x, ny - p.y);

      // Earliest of: cover, target, range, bounds.
      let tHit = 1;
      let hitTarget: { id: number; x: number; y: number } | null = null;
      let hitCover: string | null = null;

      const blocker = this.arena.firstShotBlocker(p.x, p.y, nx, ny, p.origin);
      if (blocker) { tHit = blocker.t; hitCover = blocker.cover.id; }

      for (const t of this.targets.enemiesOf(p.team)) {
        if (t.invulnerable) continue;
        const tc = segmentCircle(p.x, p.y, nx, ny, t.pos.x, t.pos.y, t.radius);
        if (tc >= 0 && tc < tHit) { tHit = tc; hitTarget = { id: t.id, x: t.pos.x, y: t.pos.y }; hitCover = null; }
      }

      const remaining = p.range - p.traveled;
      if (remaining < stepLen * tHit) {
        tHit = remaining / stepLen;
        hitTarget = null;
        hitCover = null;
      }

      p.x = p.px + (nx - p.px) * tHit;
      p.y = p.py + (ny - p.py) * tHit;
      p.traveled += stepLen * tHit;

      if (hitTarget) {
        this.bus.emit('hit', { targetId: hitTarget.id, sourceId: p.ownerId, team: p.team, amount: p.damage, x: p.x, y: p.y, status: p.status, kind: 'projectile' });
        p.alive = false;
      } else if (hitCover) {
        this.bus.emit('cover-hit', { x: p.x, y: p.y, coverId: hitCover, team: p.team });
        p.alive = false;
      } else if (tHit < 1 || !this.arena.inBounds(p)) {
        p.alive = false;
      }
    }
  }
}
