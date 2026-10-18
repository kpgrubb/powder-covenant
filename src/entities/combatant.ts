/**
 * The only thing the weapon/projectile layer knows about a living thing.
 * Player and enemy systems register their entities here; projectiles and
 * melee query it and emit `hit` events by id. Nobody reaches into anyone's
 * class. Damage is applied by the owning system when it hears the event.
 */
import type { Team } from '../core/events';
import type { Vec2 } from '../core/math';

export interface Target {
  id: number;
  team: Team;
  pos: Vec2;
  radius: number;
  alive: boolean;
  /** Dodge-roll window etc. Projectiles pass through. */
  invulnerable: boolean;
}

let nextId = 1;
export const allocId = (): number => nextId++;

export class TargetRegistry {
  private targets = new Map<number, Target>();

  add(t: Target): void { this.targets.set(t.id, t); }
  remove(id: number): void { this.targets.delete(id); }
  get(id: number): Target | undefined { return this.targets.get(id); }
  clear(): void { this.targets.clear(); }

  /** Live targets on a team. */
  *team(team: Team): IterableIterator<Target> {
    for (const t of this.targets.values()) if (t.alive && t.team === team) yield t;
  }

  /** Live targets NOT on a team. */
  *enemiesOf(team: Team): IterableIterator<Target> {
    for (const t of this.targets.values()) if (t.alive && t.team !== team) yield t;
  }

  count(team: Team): number {
    let n = 0;
    for (const t of this.targets.values()) if (t.alive && t.team === team) n++;
    return n;
  }
}
