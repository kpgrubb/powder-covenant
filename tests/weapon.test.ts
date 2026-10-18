import { describe, it, expect } from 'vitest';
import { Weapon, type AmmoStore } from '../src/weapons/weapon';
import { Rng, DEG } from '../src/core/math';
import weapons from '../src/data/weapons.json';
import type { WeaponDef } from '../src/core/types';

const defs = structuredClone(weapons) as Record<string, WeaponDef>;
const make = (id: string) => new Weapon(id, () => defs[id]);
const ammo = (reserve: Record<string, number>): AmmoStore => ({ reserve });

describe('Weapon math', () => {
  it('pistol fires six, then reports empty, and reload refills from reserve', () => {
    const w = make('pistol');
    const a = ammo({ pistol: 10 });
    const rng = new Rng(1);
    for (let i = 0; i < 6; i++) {
      const r = w.fire(0, a, rng);
      expect(r.ok).toBe(true);
      w.cooldown = 0;
    }
    expect(w.clip).toBe(0);
    expect(w.fire(0, a, rng)).toEqual({ ok: false, reason: 'empty' });
    expect(w.startReload(a)).toBe(true);
    w.update(defs.pistol.reloadTime + 0.01, a);
    expect(w.reloading).toBe(false);
    expect(w.clip).toBe(6);
    expect(a.reserve.pistol).toBe(4);
  });

  it('reports no-ammo when reserve is empty', () => {
    const w = make('rifle');
    const a = ammo({ rifle: 0 });
    const rng = new Rng(1);
    expect(w.fire(0, a, rng).ok).toBe(true);
    w.cooldown = 0;
    expect(w.fire(0, a, rng)).toEqual({ ok: false, reason: 'no-ammo' });
    expect(w.startReload(a)).toBe(false);
  });

  it('fire rate gates shots by 1/fireRate seconds', () => {
    const w = make('pistol');
    const a = ammo({ pistol: 0 });
    const rng = new Rng(1);
    expect(w.fire(0, a, rng).ok).toBe(true);
    expect(w.fire(0, a, rng)).toEqual({ ok: false, reason: 'cooldown' });
    w.update(1 / defs.pistol.fireRate - 0.01, a);
    expect(w.fire(0, a, rng).ok).toBe(false);
    w.update(0.02, a);
    expect(w.fire(0, a, rng).ok).toBe(true);
  });

  it('spread stays within the declared cone and is deterministic by seed', () => {
    const w = make('pistol');
    const a = ammo({ pistol: 100 });
    const half = (defs.pistol.spread / 2) * DEG;
    const angles: number[] = [];
    const rng = new Rng(42);
    for (let i = 0; i < 50; i++) {
      w.cooldown = 0;
      w.clip = 6;
      const r = w.fire(1.0, a, rng);
      if (r.ok) angles.push(r.shot.angle);
    }
    expect(angles.length).toBe(50);
    for (const ang of angles) expect(Math.abs(ang - 1.0)).toBeLessThanOrEqual(half + 1e-9);
    const w2 = make('pistol');
    const rng2 = new Rng(42);
    const again: number[] = [];
    for (let i = 0; i < 50; i++) { w2.cooldown = 0; w2.clip = 6; const r = w2.fire(1.0, a, rng2); if (r.ok) again.push(r.shot.angle); }
    expect(again).toEqual(angles);
    // rifle is tighter than pistol
    const r = make('rifle');
    const rr = new Rng(7);
    let maxDev = 0;
    for (let i = 0; i < 50; i++) { r.cooldown = 0; r.clip = 1; const s = r.fire(0, ammo({ rifle: 1 }), rr); if (s.ok) maxDev = Math.max(maxDev, Math.abs(s.shot.angle)); }
    expect(maxDev).toBeLessThan(half);
  });

  it('reload is cancelled by cancelReload and progress is lost', () => {
    const w = make('pistol');
    const a = ammo({ pistol: 10 });
    w.clip = 0;
    w.startReload(a);
    w.update(defs.pistol.reloadTime * 0.9, a);
    expect(w.cancelReload()).toBe(true);
    expect(w.reloading).toBe(false);
    expect(w.clip).toBe(0);
    expect(a.reserve.pistol).toBe(10);
  });

  it('switching blocks fire for switchTime', () => {
    const w = make('rifle');
    const a = ammo({ rifle: 5 });
    const rng = new Rng(1);
    w.equip();
    expect(w.fire(0, a, rng)).toEqual({ ok: false, reason: 'switching' });
    w.update(defs.rifle.switchTime + 0.01, a);
    expect(w.fire(0, a, rng).ok).toBe(true);
  });

  it('melee has no clip and never reports empty', () => {
    const w = make('saber');
    const a = ammo({});
    const rng = new Rng(1);
    for (let i = 0; i < 20; i++) { w.cooldown = 0; const r = w.fire(0.5, a, rng); expect(r.ok).toBe(true); if (r.ok) { expect(r.shot.kind).toBe('melee'); expect(r.shot.angle).toBe(0.5); } }
    expect(w.canReload(a)).toBe(false);
  });

  it('live clip-size reduction clamps the loaded clip', () => {
    const w = make('pistol');
    const a = ammo({ pistol: 0 });
    expect(w.clip).toBe(6);
    defs.pistol.clipSize = 3;
    w.update(0.016, a);
    expect(w.clip).toBe(3);
    defs.pistol.clipSize = 6;
  });
});
