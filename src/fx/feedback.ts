/**
 * Game feel. Listens to events and produces particles, muzzle flashes,
 * screen shake, floating damage numbers and sound-hook calls. Owns no game
 * state and is never read by gameplay systems; the renderer and camera read
 * it.
 */
import type { EventBus } from '../core/events';
import { type Rng } from '../core/math';
import type { Tuning } from '../core/tuning';
import type { AudioHooks } from './audio';

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; drag: number }
export interface Flash { x: number; y: number; angle: number; age: number; life: number; size: number; color: string }
export interface DamageNumber { x: number; y: number; text: string; age: number; life: number; color: string }
export interface Ring { x: number; y: number; age: number; life: number; radius: number; color: string }

export class Feedback {
  readonly particles: Particle[] = [];
  readonly flashes: Flash[] = [];
  readonly numbers: DamageNumber[] = [];
  readonly rings: Ring[] = [];
  private shake = 0;
  shakeX = 0;
  shakeY = 0;
  /** Set by main; tells feedback which entity id is the player for hurt sounds. */
  playerId = -1;

  constructor(bus: EventBus, private tuning: Tuning, private audio: AudioHooks, private rng: Rng) {
    bus.on('weapon:fired', (e) => {
      const def = this.tuning.data.weapons[e.weaponId];
      if (def?.kind === 'projectile') {
        this.flashes.push({ x: e.x, y: e.y, angle: e.angle, age: 0, life: 0.06, size: 10 + e.shake * 1.5, color: e.cursed ? '#b06cff' : '#ffe9a8' });
        this.burst(e.x, e.y, e.angle, 3 + Math.round(e.shake / 2), e.cursed ? '#b06cff' : '#ffd36b', 120, 0.18, 0.5);
      }
      this.addShake(e.shake);
      if (def?.sounds.fire) this.audio.play(def.sounds.fire);
    });
    bus.on('weapon:reload-start', (e) => { const s = this.tuning.data.weapons[e.weaponId]?.sounds.reload; if (s) this.audio.play(s); });
    bus.on('weapon:empty', (e) => { const s = this.tuning.data.weapons[e.weaponId]?.sounds.empty; if (s) this.audio.play(s); });
    bus.on('hit', (h) => {
      const dir = Math.atan2(h.y - 0, h.x - 0);
      void dir;
      if (h.team === 'player') {
        this.burst(h.x, h.y, 0, h.kind === 'melee' ? 14 : 9, '#9b1c1c', 140, 0.35, 6.28);
        this.audio.play(h.kind === 'melee' ? 'hit_blade' : 'hit_flesh');
        if (h.status === 'burn') this.rings.push({ x: h.x, y: h.y, age: 0, life: 0.3, radius: 26, color: '#b06cff' });
      } else {
        this.burst(h.x, h.y, 0, 6, '#c0392b', 110, 0.3, 6.28);
        this.addShake(2.5);
        this.audio.play('player_hurt');
      }
    });
    bus.on('cover-hit', (c) => {
      this.burst(c.x, c.y, 0, 5, '#e8d9a0', 160, 0.2, 6.28);
      this.audio.play('hit_cover');
    });
    bus.on('entity:damaged', (d) => {
      if (!this.tuning.flags.damageNumbers) return;
      const mine = d.id === this.playerId;
      this.numbers.push({ x: d.x + this.rng.range(-6, 6), y: d.y - 14, text: String(Math.round(d.amount)), age: 0, life: 0.8, color: mine ? '#ff6b6b' : '#f5e6c8' });
    });
    bus.on('entity:died', (d) => {
      this.burst(d.x, d.y, 0, 22, d.team === 'enemy' ? '#7a1010' : '#4d7cc7', 190, 0.6, 6.28);
      this.addShake(d.team === 'enemy' ? 3 : 10);
      this.audio.play(d.team === 'enemy' ? 'enemy_death' : 'player_death');
    });
    bus.on('player:dodge', (d) => { this.burst(d.x, d.y, 0, 8, '#6b5f4a', 60, 0.4, 6.28); this.audio.play('dodge'); });
    bus.on('spell:cast', () => this.audio.play('spell_cast'));
    bus.on('spell:failed', () => this.audio.play('spell_fail'));
    bus.on('spell:consumed', () => this.audio.play('spell_consume'));
    bus.on('pickup:collected', (p) => { this.burst(p.x, p.y, 0, 6, '#d6b45a', 80, 0.4, 6.28); this.audio.play('pickup'); });
    bus.on('enemy:alerted', () => this.audio.play('enemy_alert'));
  }

  addShake(amount: number): void { this.shake = Math.min(18, this.shake + amount); }

  /** Spray `n` particles around `angle` within `cone` radians. */
  burst(x: number, y: number, angle: number, n: number, color: string, speed: number, life: number, cone: number): void {
    for (let i = 0; i < n; i++) {
      const a = angle + this.rng.range(-cone / 2, cone / 2);
      const s = speed * this.rng.range(0.4, 1.1);
      const l = life * this.rng.range(0.6, 1.2);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, maxLife: l, color, size: this.rng.range(1.5, 3.5), drag: 4 });
    }
    if (this.particles.length > 1200) this.particles.splice(0, this.particles.length - 1200);
  }

  ember(x: number, y: number): void {
    this.particles.push({ x: x + this.rng.range(-8, 8), y: y + this.rng.range(-8, 8), vx: this.rng.range(-10, 10), vy: this.rng.range(-50, -20), life: 0.5, maxLife: 0.5, color: '#b06cff', size: 2, drag: 1 });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) { this.flashes[i].age += dt; if (this.flashes[i].age >= this.flashes[i].life) this.flashes.splice(i, 1); }
    for (let i = this.rings.length - 1; i >= 0; i--) { this.rings[i].age += dt; if (this.rings[i].age >= this.rings[i].life) this.rings.splice(i, 1); }
    for (let i = this.numbers.length - 1; i >= 0; i--) { const n = this.numbers[i]; n.age += dt; n.y -= 28 * dt; if (n.age >= n.life) this.numbers.splice(i, 1); }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - 40 * dt);
      this.shakeX = this.rng.range(-1, 1) * this.shake;
      this.shakeY = this.rng.range(-1, 1) * this.shake;
    } else {
      this.shakeX = this.shakeY = 0;
    }
  }

  clear(): void {
    this.particles.length = 0;
    this.flashes.length = 0;
    this.numbers.length = 0;
    this.rings.length = 0;
    this.shake = 0;
  }
}
