/**
 * Live tuning store. Holds the mutable copy of every data file. Systems read
 * from `tuning.data` at use-time (never cache a stat), so a change from the
 * debug panel takes effect on the next tick without a restart.
 *
 * `get(path)` / `set(path, value)` address values with dotted paths such as
 * `weapons.pistol.damage`. `set` emits `tuning:changed` so systems that must
 * react (e.g. clamp current health to a new max) can.
 */
import type { EventBus } from './events';
import type { GameData } from './types';

export type TuningValue = number | boolean;

export class Tuning {
  /** Live, mutable data. */
  data: GameData;
  /** Pristine copy for reset. */
  private readonly defaults: GameData;
  /** Toggles that live outside the data files. */
  flags: { damageNumbers: boolean; aiDebug: boolean; godMode: boolean; showCoverSpots: boolean };

  constructor(data: GameData, private bus?: EventBus) {
    this.defaults = structuredClone(data);
    this.data = structuredClone(data);
    this.flags = { damageNumbers: true, aiDebug: false, godMode: false, showCoverSpots: false };
  }

  get(path: string): TuningValue | undefined {
    const parts = path.split('.');
    let node: unknown = parts[0] === 'flags' ? this.flags : this.data;
    const start = parts[0] === 'flags' ? 1 : 0;
    for (let i = start; i < parts.length; i++) {
      if (node === null || typeof node !== 'object') return undefined;
      node = (node as Record<string, unknown>)[parts[i]];
    }
    return typeof node === 'number' || typeof node === 'boolean' ? node : undefined;
  }

  /** Returns false if the path does not resolve to an existing number/boolean. */
  set(path: string, value: TuningValue): boolean {
    const parts = path.split('.');
    let node: unknown = parts[0] === 'flags' ? this.flags : this.data;
    const start = parts[0] === 'flags' ? 1 : 0;
    for (let i = start; i < parts.length - 1; i++) {
      if (node === null || typeof node !== 'object') return false;
      node = (node as Record<string, unknown>)[parts[i]];
    }
    if (node === null || typeof node !== 'object') return false;
    const key = parts[parts.length - 1];
    const obj = node as Record<string, unknown>;
    const current = obj[key];
    if (typeof current !== typeof value) return false;
    if (current === value) return true;
    obj[key] = value;
    this.bus?.emit('tuning:changed', { path, value });
    return true;
  }

  reset(): void {
    this.data = structuredClone(this.defaults);
    this.bus?.emit('tuning:reset', {});
  }

  defaultOf(path: string): TuningValue | undefined {
    const saved = this.data;
    this.data = this.defaults;
    const v = this.get(path);
    this.data = saved;
    return v;
  }
}
