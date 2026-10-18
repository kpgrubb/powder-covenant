/**
 * Resolves a melee swing against every opposing target inside the arc.
 * Uses the same cover rules as shots: a wall stops a blade, sandbags do not
 * when you are leaning on them.
 */
import type { EventBus, StatusKind, Team } from '../core/events';
import { angleDiff, dist, type Vec2 } from '../core/math';
import type { TargetRegistry } from '../entities/combatant';
import type { Arena } from '../world/arena';

export interface Swing {
  origin: Vec2;
  angle: number;
  arc: number;
  range: number;
  damage: number;
  knockback: number;
  team: Team;
  ownerId: number;
  status?: StatusKind;
}

export interface SwingVisual {
  x: number;
  y: number;
  angle: number;
  arc: number;
  range: number;
  age: number;
  life: number;
}

export class MeleeSystem {
  readonly swings: SwingVisual[] = [];

  constructor(private bus: EventBus, private arena: Arena, private targets: TargetRegistry) {}

  /** Returns number of targets hit. */
  resolve(s: Swing): number {
    this.swings.push({ x: s.origin.x, y: s.origin.y, angle: s.angle, arc: s.arc, range: s.range, age: 0, life: 0.14 });
    let hits = 0;
    for (const t of this.targets.enemiesOf(s.team)) {
      if (t.invulnerable) continue;
      const d = dist(s.origin, t.pos);
      if (d - t.radius > s.range) continue;
      const toT = Math.atan2(t.pos.y - s.origin.y, t.pos.x - s.origin.x);
      // A target hugging the attacker counts regardless of angle.
      if (d > t.radius + 4 && Math.abs(angleDiff(s.angle, toT)) > s.arc / 2) continue;
      if (this.arena.firstShotBlocker(s.origin.x, s.origin.y, t.pos.x, t.pos.y, s.origin)) continue;
      this.bus.emit('hit', { targetId: t.id, sourceId: s.ownerId, team: s.team, amount: s.damage, x: t.pos.x, y: t.pos.y, status: s.status, kind: 'melee' });
      hits++;
    }
    return hits;
  }

  update(dt: number): void {
    for (let i = this.swings.length - 1; i >= 0; i--) {
      this.swings[i].age += dt;
      if (this.swings[i].age >= this.swings[i].life) this.swings.splice(i, 1);
    }
  }
}
