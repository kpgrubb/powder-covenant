/**
 * Weapon state machine shared by every weapon. Reads its definition from the
 * tuning store on every call so debug-panel edits apply immediately.
 *
 * States: ready → (fire) cooldown → ready; ready → (reload) reloading → ready;
 * any → (switch) switching → ready. Damage taken cancels a reload.
 */
import { DEG, type Rng } from '../core/math';
import type { WeaponDef } from '../core/types';

export interface AmmoStore {
  /** Reserve rounds by ammo type. */
  reserve: Record<string, number>;
}

export interface Shot {
  kind: 'projectile' | 'melee';
  angle: number;
  damage: number;
  range: number;
  speed: number;
  arc: number;
  knockback: number;
  visual: string;
  shake: number;
}

export type FireResult =
  | { ok: true; shot: Shot }
  | { ok: false; reason: 'cooldown' | 'reloading' | 'switching' | 'empty' | 'no-ammo' };

export class Weapon {
  clip = 0;
  cooldown = 0;
  reloadTimer = 0;
  reloading = false;
  switchTimer = 0;

  constructor(public readonly id: string, private readonly lookup: () => WeaponDef) {
    this.clip = this.def.clipSize;
  }

  get def(): WeaponDef { return this.lookup(); }
  get hasClip(): boolean { return this.def.clipSize > 0; }
  get ready(): boolean { return this.cooldown <= 0 && !this.reloading && this.switchTimer <= 0; }
  get reloadProgress(): number { return this.reloading ? 1 - this.reloadTimer / this.def.reloadTime : 0; }

  update(dt: number, ammo: AmmoStore): void {
    const def = this.def;
    // Live clip-size edits: never carry more than the clip holds.
    if (this.hasClip && this.clip > def.clipSize) this.clip = def.clipSize;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.switchTimer > 0) this.switchTimer -= dt;
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload(ammo);
    }
  }

  /** Called when this weapon becomes the active one. */
  equip(): void {
    this.switchTimer = this.def.switchTime;
    this.cooldown = 0;
    this.cancelReload();
  }

  canReload(ammo: AmmoStore): boolean {
    const def = this.def;
    if (!this.hasClip || this.reloading || this.switchTimer > 0) return false;
    if (this.clip >= def.clipSize) return false;
    return (ammo.reserve[def.ammoType] ?? 0) > 0;
  }

  startReload(ammo: AmmoStore): boolean {
    if (!this.canReload(ammo)) return false;
    this.reloading = true;
    this.reloadTimer = this.def.reloadTime;
    return true;
  }

  /** Damage taken, weapon switch: progress is lost. */
  cancelReload(): boolean {
    if (!this.reloading) return false;
    this.reloading = false;
    this.reloadTimer = 0;
    return true;
  }

  private finishReload(ammo: AmmoStore): void {
    const def = this.def;
    this.reloading = false;
    this.reloadTimer = 0;
    const have = ammo.reserve[def.ammoType] ?? 0;
    const need = def.clipSize - this.clip;
    const take = Math.min(have, need);
    ammo.reserve[def.ammoType] = have - take;
    this.clip += take;
  }

  /**
   * Attempt to fire toward `aimAngle`. Returns the shot to spawn, or why not.
   * Spread is sampled from `rng` so it is reproducible in tests.
   */
  fire(aimAngle: number, ammo: AmmoStore, rng: Rng): FireResult {
    const def = this.def;
    if (this.switchTimer > 0) return { ok: false, reason: 'switching' };
    if (this.reloading) return { ok: false, reason: 'reloading' };
    if (this.cooldown > 0) return { ok: false, reason: 'cooldown' };
    if (this.hasClip && this.clip <= 0) {
      return { ok: false, reason: (ammo.reserve[def.ammoType] ?? 0) > 0 ? 'empty' : 'no-ammo' };
    }
    if (this.hasClip) this.clip--;
    this.cooldown = 1 / def.fireRate;
    const spread = def.kind === 'projectile' ? rng.range(-def.spread / 2, def.spread / 2) * DEG : 0;
    return {
      ok: true,
      shot: {
        kind: def.kind,
        angle: aimAngle + spread,
        damage: def.damage,
        range: def.range,
        speed: def.projectileSpeed,
        arc: def.meleeArc * DEG,
        knockback: def.knockback,
        visual: def.visual,
        shake: def.shake,
      },
    };
  }
}
