/**
 * Player controller. Consumes a PlayerIntent (built from raw input by main,
 * or by a test) and drives movement, stamina, dodge, weapon hotbar, and
 * Grit. Damage arrives through the `hit` event; the player never reads an
 * enemy and no enemy reads the player beyond the Target registry.
 */
import type { EventBus } from '../core/events';
import { moveCircle, normalize, type Rng, type Vec2 } from '../core/math';
import type { Tuning } from '../core/tuning';
import type { PlayerDef } from '../core/types';
import type { Arena } from '../world/arena';
import { Weapon, type AmmoStore } from '../weapons/weapon';
import type { ProjectileSystem } from '../weapons/projectiles';
import type { MeleeSystem } from '../weapons/melee';
import type { SpellSystem, GritSource } from '../magic/cursedShot';
import { allocId, type Target, type TargetRegistry } from './combatant';

export interface PlayerIntent {
  /** Unit-ish movement vector from WASD. */
  move: Vec2;
  /** World-space aim point. */
  aim: Vec2;
  firePressed: boolean;
  reload: boolean;
  dodge: boolean;
  sprint: boolean;
  /** Hotbar index to switch to, or -1. */
  switchTo: number;
  cast: boolean;
}

export const idleIntent = (): PlayerIntent => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, firePressed: false, reload: false, dodge: false, sprint: false, switchTo: -1, cast: false });

export class Player implements GritSource {
  readonly id = allocId();
  readonly team = 'player' as const;
  pos: Vec2;
  aim = 0;
  health: number;
  stamina: number;
  grit: number;
  alive = true;
  sprinting = false;
  hitFlash = 0;
  private staminaDelay = 0;
  dodge = { active: false, timer: 0, dir: { x: 1, y: 0 } };
  readonly weapons: Weapon[];
  activeIndex = 1;
  readonly ammo: AmmoStore;
  readonly target: Target;
  /** Last fire attempt that failed and why, for the HUD. */
  lastFireFail: string | null = null;
  private unsub: Array<() => void> = [];

  constructor(
    private bus: EventBus,
    private tuning: Tuning,
    private arena: Arena,
    private projectiles: ProjectileSystem,
    private melee: MeleeSystem,
    private spells: SpellSystem,
    registry: TargetRegistry,
    private rng: Rng,
  ) {
    const def = this.def;
    this.pos = { ...arena.def.playerSpawn };
    this.health = def.maxHealth;
    this.stamina = def.maxStamina;
    this.grit = def.maxGrit;
    this.ammo = { reserve: { ...def.startingAmmo } };
    this.weapons = def.startingWeapons.map((id) => new Weapon(id, () => this.tuning.data.weapons[id]));
    this.weapons[this.activeIndex].equip();
    const self = this;
    this.target = {
      id: this.id,
      team: 'player',
      get pos() { return self.pos; },
      get radius() { return self.def.radius; },
      get alive() { return self.alive; },
      get invulnerable() { return self.invulnerable; },
    };
    registry.add(this.target);
    this.unsub.push(bus.on('hit', (h) => { if (h.targetId === this.id) this.applyDamage(h.amount, h.x, h.y); }));
    this.unsub.push(bus.on('pickup:collected', (p) => { if (p.kind in this.def.maxAmmo) this.addAmmo(p.kind, p.amount); }));
  }

  get def(): PlayerDef { return this.tuning.data.player; }
  get weapon(): Weapon { return this.weapons[this.activeIndex]; }
  get invulnerable(): boolean {
    return this.tuning.flags.godMode || (this.dodge.active && this.dodge.timer > this.def.dodge.duration - this.def.dodge.invulnWindow);
  }
  get maxHealth(): number { return this.def.maxHealth; }
  get maxStamina(): number { return this.def.maxStamina; }
  get maxGrit(): number { return this.def.maxGrit; }

  spend(amount: number): boolean {
    if (this.grit < amount) return false;
    this.grit -= amount;
    this.bus.emit('player:grit-changed', { grit: this.grit, max: this.maxGrit });
    return true;
  }

  refillGrit(): void {
    this.grit = this.maxGrit;
    this.bus.emit('player:grit-changed', { grit: this.grit, max: this.maxGrit });
  }

  addAmmo(type: string, amount: number): number {
    const max = this.def.maxAmmo[type] ?? Infinity;
    const before = this.ammo.reserve[type] ?? 0;
    const after = Math.min(max, before + amount);
    this.ammo.reserve[type] = after;
    return after - before;
  }

  update(dt: number, intent: PlayerIntent): void {
    const def = this.def;
    // Live tuning: clamp pools to possibly-changed maxima.
    this.health = Math.min(this.health, def.maxHealth);
    this.stamina = Math.min(this.stamina, def.maxStamina);
    this.grit = Math.min(this.grit, def.maxGrit);
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (!this.alive) return;

    this.aim = Math.atan2(intent.aim.y - this.pos.y, intent.aim.x - this.pos.x);
    const move = normalize(intent.move.x, intent.move.y);
    const moving = move.x !== 0 || move.y !== 0;

    // --- dodge ---
    if (intent.dodge && !this.dodge.active && this.stamina >= def.dodge.staminaCost) {
      this.dodge.active = true;
      this.dodge.timer = def.dodge.duration;
      this.dodge.dir = moving ? move : { x: Math.cos(this.aim), y: Math.sin(this.aim) };
      this.stamina -= def.dodge.staminaCost;
      this.staminaDelay = def.staminaRegenDelay;
      this.weapon.cancelReload();
      this.bus.emit('player:dodge', { x: this.pos.x, y: this.pos.y });
    }

    // --- movement ---
    let vx = 0;
    let vy = 0;
    if (this.dodge.active) {
      this.dodge.timer -= dt;
      if (this.dodge.timer <= 0) this.dodge.active = false;
      vx = this.dodge.dir.x * def.dodge.speed;
      vy = this.dodge.dir.y * def.dodge.speed;
      this.sprinting = false;
    } else {
      this.sprinting = intent.sprint && moving && this.stamina > 0;
      const speed = def.speed * (this.sprinting ? def.sprintMultiplier : 1);
      vx = move.x * speed;
      vy = move.y * speed;
    }
    if (vx || vy) this.pos = moveCircle(this.pos, def.radius, vx * dt, vy * dt, this.arena.solids, this.arena.bounds);

    // --- stamina ---
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - def.staminaDrainSprint * dt);
      this.staminaDelay = def.staminaRegenDelay;
    } else if (this.staminaDelay > 0) {
      this.staminaDelay -= dt;
    } else {
      this.stamina = Math.min(def.maxStamina, this.stamina + def.staminaRegen * dt);
    }

    // --- hotbar ---
    if (intent.switchTo >= 0 && intent.switchTo < this.weapons.length && intent.switchTo !== this.activeIndex) {
      this.activeIndex = intent.switchTo;
      this.weapon.equip();
      this.bus.emit('weapon:switched', { ownerId: this.id, weaponId: this.weapon.id });
    }
    for (const w of this.weapons) {
      const was = w.reloading;
      w.update(dt, this.ammo);
      if (was && !w.reloading) this.bus.emit('weapon:reload-done', { ownerId: this.id, weaponId: w.id });
    }

    // --- spell ---
    if (intent.cast) this.spells.castCursedShot();

    // --- reload ---
    if (intent.reload && this.weapon.startReload(this.ammo)) {
      this.bus.emit('weapon:reload-start', { ownerId: this.id, weaponId: this.weapon.id });
    }

    // --- fire ---
    this.lastFireFail = null;
    if (intent.firePressed && !this.dodge.active) this.fire();
  }

  private fire(): void {
    const w = this.weapon;
    const wasReloading = w.reloading;
    const res = w.fire(this.aim, this.ammo, this.rng);
    if (!res.ok) {
      this.lastFireFail = res.reason;
      if (res.reason === 'empty' && !wasReloading) {
        this.bus.emit('weapon:empty', { ownerId: this.id, weaponId: w.id });
        if (w.startReload(this.ammo)) this.bus.emit('weapon:reload-start', { ownerId: this.id, weaponId: w.id });
      } else if (res.reason === 'no-ammo') {
        this.bus.emit('weapon:empty', { ownerId: this.id, weaponId: w.id });
      }
      return;
    }
    const shot = res.shot;
    const status = this.spells.consume();
    const def = this.def;
    const mx = this.pos.x + Math.cos(this.aim) * (def.radius + 8);
    const my = this.pos.y + Math.sin(this.aim) * (def.radius + 8);
    this.bus.emit('weapon:fired', { ownerId: this.id, team: 'player', weaponId: w.id, x: mx, y: my, angle: shot.angle, shake: shot.shake, cursed: !!status });
    if (shot.kind === 'projectile') {
      this.projectiles.spawn({ x: mx, y: my, angle: shot.angle, speed: shot.speed, damage: shot.damage, range: shot.range, knockback: shot.knockback, team: 'player', ownerId: this.id, visual: status ? 'bullet_cursed' : shot.visual, status });
    } else {
      this.melee.resolve({ origin: this.pos, angle: shot.angle, arc: shot.arc, range: shot.range, damage: shot.damage, knockback: shot.knockback, team: 'player', ownerId: this.id, status });
    }
    // Reload automatically when the last round leaves a clip (click-to-fire stays deliberate).
    if (w.hasClip && w.clip === 0 && w.startReload(this.ammo)) {
      this.bus.emit('weapon:reload-start', { ownerId: this.id, weaponId: w.id });
    }
  }

  applyDamage(amount: number, x: number, y: number): void {
    if (!this.alive || this.invulnerable) return;
    this.health -= amount;
    this.hitFlash = this.def.hitFlash;
    if (this.weapon.cancelReload()) this.bus.emit('weapon:reload-interrupted', { ownerId: this.id, weaponId: this.weapon.id });
    this.bus.emit('entity:damaged', { id: this.id, team: 'player', amount, health: this.health, x, y });
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.bus.emit('entity:died', { id: this.id, team: 'player', x: this.pos.x, y: this.pos.y });
    }
  }

  reset(): void {
    const def = this.def;
    this.pos = { ...this.arena.def.playerSpawn };
    this.health = def.maxHealth;
    this.stamina = def.maxStamina;
    this.grit = def.maxGrit;
    this.alive = true;
    this.dodge.active = false;
    this.ammo.reserve = { ...def.startingAmmo };
    for (const w of this.weapons) { w.cancelReload(); w.clip = w.def.clipSize; w.cooldown = 0; }
    this.activeIndex = 1;
    this.weapon.equip();
    this.spells.reset();
  }
}
