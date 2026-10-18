/**
 * Spell system. Milestone 0 has one spell: Cursed Shot arms the next hit
 * with Burn. The player hands over a GritSource (read + spend) rather than
 * itself; the weapon layer asks `consume()` when a shot leaves the barrel.
 */
import type { EventBus, StatusKind } from '../core/events';
import type { Tuning } from '../core/tuning';

export interface GritSource {
  readonly grit: number;
  spend(amount: number): boolean;
}

export class SpellSystem {
  armed: StatusKind | null = null;

  constructor(private bus: EventBus, private tuning: Tuning, private grit: GritSource) {}

  get cursedShotDef() { return this.tuning.data.spells.cursedShot; }

  castCursedShot(): boolean {
    const def = this.cursedShotDef;
    if (this.armed) { this.bus.emit('spell:failed', { spellId: 'cursedShot', reason: 'already-armed' }); return false; }
    if (this.grit.grit < def.cost || !this.grit.spend(def.cost)) {
      this.bus.emit('spell:failed', { spellId: 'cursedShot', reason: 'grit' });
      return false;
    }
    this.armed = def.status;
    this.bus.emit('spell:cast', { spellId: 'cursedShot', cost: def.cost });
    return true;
  }

  /** Called by the firing code. Returns the status to attach, if any. */
  consume(): StatusKind | undefined {
    if (!this.armed) return undefined;
    const s = this.armed;
    this.armed = null;
    this.bus.emit('spell:consumed', { spellId: 'cursedShot' });
    return s;
  }

  reset(): void { this.armed = null; }
}
