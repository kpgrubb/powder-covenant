import { describe, it, expect } from 'vitest';
import { Tuning } from '../src/core/tuning';
import { EventBus } from '../src/core/events';
import { buildData } from '../src/main';
import { DEBUG_SCHEMA, DEBUG_FLAGS } from '../src/ui/debugPanel';
import { Weapon } from '../src/weapons/weapon';
import { Rng } from '../src/core/math';

describe('Tuning store (debug panel apply logic)', () => {
  it('get/set round-trip a numeric path and emit a change event', () => {
    const bus = new EventBus();
    const t = new Tuning(buildData(), bus);
    const seen: Array<{ path: string; value: number | boolean }> = [];
    bus.on('tuning:changed', (e) => seen.push(e));
    expect(t.get('weapons.pistol.damage')).toBe(24);
    expect(t.set('weapons.pistol.damage', 40)).toBe(true);
    expect(t.get('weapons.pistol.damage')).toBe(40);
    expect(t.data.weapons.pistol.damage).toBe(40);
    expect(seen).toEqual([{ path: 'weapons.pistol.damage', value: 40 }]);
  });

  it('rejects unknown paths and type mismatches', () => {
    const t = new Tuning(buildData());
    expect(t.set('weapons.pistol.nope', 1)).toBe(false);
    expect(t.set('weapons.pistol.name', 1)).toBe(false);
    expect(t.set('weapons.pistol.damage', true)).toBe(false);
  });

  it('flags live under flags.* and accept booleans', () => {
    const t = new Tuning(buildData());
    expect(t.get('flags.damageNumbers')).toBe(true);
    expect(t.set('flags.damageNumbers', false)).toBe(true);
    expect(t.flags.damageNumbers).toBe(false);
  });

  it('every debug panel row and flag resolves to a live value', () => {
    const t = new Tuning(buildData());
    for (const g of DEBUG_SCHEMA) for (const r of g.rows) {
      const v = t.get(r.path);
      expect(typeof v, r.path).toBe('number');
      expect(t.set(r.path, (v as number) + r.step), r.path).toBe(true);
    }
    for (const f of DEBUG_FLAGS) expect(typeof t.get(f.path), f.path).toBe('boolean');
  });

  it('reset restores defaults without breaking references held by systems', () => {
    const t = new Tuning(buildData());
    t.set('weapons.rifle.damage', 1);
    t.reset();
    expect(t.get('weapons.rifle.damage')).toBe(90);
    expect(t.defaultOf('weapons.rifle.damage')).toBe(90);
  });

  it('a weapon reads the live value at fire time, not a cached one', () => {
    const t = new Tuning(buildData());
    const w = new Weapon('pistol', () => t.data.weapons.pistol);
    const rng = new Rng(3);
    const a = { reserve: { pistol: 0 } };
    const first = w.fire(0, a, rng);
    expect(first.ok && first.shot.damage).toBe(24);
    t.set('weapons.pistol.damage', 99);
    w.cooldown = 0;
    const second = w.fire(0, a, rng);
    expect(second.ok && second.shot.damage).toBe(99);
  });
});
