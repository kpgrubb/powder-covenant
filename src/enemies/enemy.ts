/**
 * Confederate regular: patrol → detect → take cover → fire in bursts →
 * reposition when flanked, pushed, or stalled. Also the spawner and the ammo
 * drops. Finds the player only through the Target registry; damage arrives
 * as `hit` events.
 */
import type { EventBus } from '../core/events';
import { DEG, angleDiff, dist, lerp, moveCircle, normalize, segmentRect, type Rng, type Vec2 } from '../core/math';
import type { Tuning } from '../core/tuning';
import type { EnemyDef } from '../core/types';
import { allocId, type Target, type TargetRegistry } from '../entities/combatant';
import { applyBurn, emptyStatus, tickStatus, type StatusState } from '../magic/status';
import type { Arena, CoverSpot } from '../world/arena';
import type { ProjectileSystem } from '../weapons/projectiles';

export type EnemyState = 'patrol' | 'alert' | 'seek' | 'hold' | 'peek' | 'advance' | 'search';

export interface Pickup { x: number; y: number; kind: 'ammo'; pistol: number; rifle: number; visual: string; age: number }

export class Enemy {
  readonly id = allocId();
  readonly team = 'enemy' as const;
  pos: Vec2;
  facing = 0;
  health: number;
  maxHealth: number;
  alive = true;
  hitFlash = 0;
  status: StatusState = emptyStatus();
  state: EnemyState = 'patrol';
  stateTime = 0;
  route: Vec2[];
  wp = 0;
  lastKnown: Vec2 | null = null;
  lostTimer = 0;
  canSee = false;
  spot: CoverSpot | null = null;
  holdTime = 0;
  hitsLanded = 0;
  path: Vec2[] = [];
  pathTimer = 0;
  pathGoal: Vec2 | null = null;
  burstRemaining = 0;
  burstTimer = 0;
  fireCooldown = 0;
  firstShotTimer = 0;
  flankTimer = 0;
  peekPoint: Vec2 | null = null;
  peekFired = false;
  advanceRecheck = 0;
  readonly target: Target;

  constructor(public readonly typeId: string, pos: Vec2, route: Vec2[], def: EnemyDef, private lookup: () => EnemyDef) {
    this.pos = { ...pos };
    this.route = route;
    this.health = this.maxHealth = def.health;
    const self = this;
    this.target = {
      id: this.id,
      team: 'enemy',
      get pos() { return self.pos; },
      get radius() { return self.lookup().radius; },
      get alive() { return self.alive; },
      invulnerable: false,
    };
  }

  get def(): EnemyDef { return this.lookup(); }

  setState(s: EnemyState, bus: EventBus): void {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    this.path = [];
    this.pathGoal = null;
    bus.emit('enemy:state', { id: this.id, state: s });
  }
}

export class EnemySystem {
  readonly enemies: Enemy[] = [];
  readonly pickups: Pickup[] = [];
  private routeCursor = 0;

  constructor(
    private bus: EventBus,
    private tuning: Tuning,
    private arena: Arena,
    private projectiles: ProjectileSystem,
    private registry: TargetRegistry,
    private rng: Rng,
    private onEmber?: (x: number, y: number) => void,
  ) {
    bus.on('hit', (h) => {
      if (h.team !== 'player') {
        const shooter = this.enemies.find((e) => e.id === h.sourceId);
        if (shooter) shooter.hitsLanded++;
        return;
      }
      const e = this.enemies.find((x) => x.id === h.targetId);
      if (!e) return;
      this.damage(e, h.amount, h.x, h.y);
      if (h.status === 'burn' && e.alive) applyBurn(e.status, this.tuning.data.spells.cursedShot.burn);
    });
    bus.on('weapon:fired', (f) => {
      if (f.team !== 'player') return;
      const def = this.tuning.data.weapons[f.weaponId];
      if (def?.kind !== 'projectile') return;
      this.hear({ x: f.x, y: f.y });
    });
    bus.on('noise', (n) => { if (n.team === 'player') this.hear({ x: n.x, y: n.y }); });
    bus.on('tuning:changed', (t) => {
      if (t.path === 'enemies.regular.health' && typeof t.value === 'number') {
        for (const e of this.enemies) {
          const ratio = e.maxHealth > 0 ? e.health / e.maxHealth : 1;
          e.maxHealth = t.value;
          e.health = Math.max(1, Math.round(ratio * t.value));
        }
      }
    });
  }

  def(typeId: string): EnemyDef { return this.tuning.data.enemies[typeId]; }

  spawn(typeId = 'regular', at?: Vec2, routeIndex?: number): Enemy {
    const routes = this.arena.def.patrolRoutes;
    const ri = routeIndex ?? this.routeCursor++ % routes.length;
    const route = routes[ri];
    const pos = at ?? route[0];
    const e = new Enemy(typeId, pos, route, this.def(typeId), () => this.def(typeId));
    this.enemies.push(e);
    this.registry.add(e.target);
    this.bus.emit('enemy:spawned', { id: e.id, x: e.pos.x, y: e.pos.y });
    return e;
  }

  clear(): void {
    for (const e of this.enemies) this.registry.remove(e.id);
    this.enemies.length = 0;
    this.pickups.length = 0;
  }

  get aliveCount(): number { return this.enemies.filter((e) => e.alive).length; }

  private hear(at: Vec2): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (dist(e.pos, at) > e.def.hearingRange) continue;
      e.lastKnown = { ...at };
      if (e.state === 'patrol' || e.state === 'search') {
        e.setState('alert', this.bus);
        this.bus.emit('enemy:alerted', { id: e.id, x: e.pos.x, y: e.pos.y });
      }
    }
  }

  private damage(e: Enemy, amount: number, x: number, y: number): void {
    if (!e.alive) return;
    e.health -= amount;
    e.hitFlash = e.def.hitFlash;
    this.bus.emit('entity:damaged', { id: e.id, team: 'enemy', amount, health: e.health, x, y });
    if (e.state === 'patrol' || e.state === 'search') {
      const p = this.player();
      if (p) e.lastKnown = { ...p.pos };
      e.setState('alert', this.bus);
    }
    if (e.health <= 0) this.kill(e);
  }

  private kill(e: Enemy): void {
    e.alive = false;
    e.health = 0;
    this.registry.remove(e.id);
    this.bus.emit('entity:died', { id: e.id, team: 'enemy', x: e.pos.x, y: e.pos.y });
    const d = e.def.drop;
    if (this.rng.next() < d.chance) this.pickups.push({ x: e.pos.x, y: e.pos.y, kind: 'ammo', pistol: d.pistol, rifle: d.rifle, visual: 'pickup_ammo', age: 0 });
  }

  private player(): Target | undefined {
    for (const t of this.registry.team('player')) return t;
    return undefined;
  }

  update(dt: number): void {
    const player = this.player();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) { this.enemies.splice(i, 1); continue; }
      this.tick(e, dt, player);
    }
    this.separate();
    this.updatePickups(dt, player);
  }

  private tick(e: Enemy, dt: number, player: Target | undefined): void {
    const def = e.def;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    const burnDmg = tickStatus(e.status, dt);
    if (burnDmg > 0) {
      this.damage(e, burnDmg, e.pos.x, e.pos.y);
      if (!e.alive) return;
    }
    if (e.status.burn && this.onEmber && this.rng.next() < 0.5) this.onEmber(e.pos.x, e.pos.y);

    e.stateTime += dt;
    e.pathTimer -= dt;
    e.flankTimer -= dt;
    if (e.fireCooldown > 0) e.fireCooldown -= dt;

    // --- perception ---
    const sawBefore = e.canSee;
    e.canSee = false;
    if (player) {
      const d = dist(e.pos, player.pos);
      if (d <= def.visionRange) {
        const ang = Math.atan2(player.pos.y - e.pos.y, player.pos.x - e.pos.x);
        const inCone = Math.abs(angleDiff(e.facing, ang)) <= (def.visionCone / 2) * DEG || d < 48;
        if (inCone && this.arena.hasLineOfSight(e.pos, player.pos)) e.canSee = true;
      }
    }
    if (e.canSee && player) {
      e.lastKnown = { ...player.pos };
      e.lostTimer = 0;
      if (!sawBefore) e.firstShotTimer = def.firstShotDelay;
    } else {
      e.lostTimer += dt;
    }

    switch (e.state) {
      case 'patrol': this.patrol(e, dt); break;
      case 'alert': this.alert(e); break;
      case 'seek': this.seek(e, dt, player); break;
      case 'hold': this.hold(e, dt, player); break;
      case 'peek': this.peek(e, dt, player); break;
      case 'advance': this.advance(e, dt, player); break;
      case 'search': this.search(e, dt); break;
    }
  }

  // ---------------- states ----------------

  private patrol(e: Enemy, dt: number): void {
    if (e.canSee) {
      e.setState('alert', this.bus);
      this.bus.emit('enemy:alerted', { id: e.id, x: e.pos.x, y: e.pos.y });
      return;
    }
    if (!e.route.length) return;
    const wp = e.route[e.wp];
    if (dist(e.pos, wp) < 8) { e.wp = (e.wp + 1) % e.route.length; e.path = []; e.pathGoal = null; return; }
    this.moveAlongPath(e, wp, dt, 0.8);
  }

  private alert(e: Enemy): void {
    if (e.stateTime < e.def.reactionTime) return;
    this.pickCover(e, 'any', null);
  }

  private pickCover(e: Enemy, pref: 'any' | 'closer' | 'farther', exclude: CoverSpot | null): void {
    const anchor = e.lastKnown ?? this.player()?.pos;
    if (!anchor) { e.setState('patrol', this.bus); return; }
    const spot = this.chooseSpot(e, anchor, pref, exclude);
    e.hitsLanded = 0;
    e.holdTime = 0;
    if (spot) {
      e.spot = spot;
      e.setState('seek', this.bus);
    } else {
      e.spot = null;
      e.setState('advance', this.bus);
    }
  }

  private seek(e: Enemy, dt: number, player: Target | undefined): void {
    if (!e.spot) { this.pickCover(e, 'any', null); return; }
    this.fireLogic(e, dt, player);
    if (dist(e.pos, e.spot) < 6) {
      e.pos = { x: e.spot.x, y: e.spot.y };
      e.holdTime = 0;
      e.flankTimer = 0.3;
      e.setState('hold', this.bus);
      return;
    }
    this.moveAlongPath(e, e.spot, dt, 1);
    if (e.stateTime > 6) this.pickCover(e, 'any', e.spot); // stuck
  }

  private hold(e: Enemy, dt: number, player: Target | undefined): void {
    const def = e.def;
    const spot = e.spot;
    if (!spot) { this.pickCover(e, 'any', null); return; }
    e.holdTime += dt;
    if (player) {
      const d = dist(e.pos, player.pos);
      if (d < def.retreatDistance) { this.pickCover(e, 'farther', spot); return; }
      if (e.flankTimer <= 0) {
        e.flankTimer = 0.3;
        const covered = segmentRect(e.pos.x, e.pos.y, player.pos.x, player.pos.y, spot.cover.rect) >= 0;
        if (!covered && (e.canSee || e.lostTimer < 1)) { this.pickCover(e, 'any', spot); return; }
      }
    }
    if (e.canSee) {
      this.fireLogic(e, dt, player);
    } else if (e.lastKnown && spot.cover.rules.blocksSight && e.lostTimer > 0.6 && e.lostTimer < def.lostSightSearchAfter && e.fireCooldown <= 0) {
      const pp = this.findPeekPoint(e, spot, e.lastKnown);
      if (pp) { e.peekPoint = pp; e.peekFired = false; e.setState('peek', this.bus); return; }
    }
    if (e.lostTimer > def.lostSightSearchAfter) { e.setState('search', this.bus); return; }
    if (e.holdTime > def.advanceAfter && e.hitsLanded === 0) { this.pickCover(e, 'closer', spot); return; }
  }

  private peek(e: Enemy, dt: number, player: Target | undefined): void {
    const spot = e.spot;
    const pp = e.peekPoint;
    if (!spot || !pp) { e.setState('hold', this.bus); return; }
    if (!e.peekFired) {
      if (dist(e.pos, pp) > 4) { this.moveDirect(e, pp, dt); }
      if (e.canSee) {
        this.fireLogic(e, dt, player);
        if (e.burstRemaining === 0 && e.fireCooldown > 0) e.peekFired = true; // burst done
      } else if (e.stateTime > 1.2) {
        e.peekFired = true;
      }
    } else {
      if (dist(e.pos, spot) > 4) this.moveDirect(e, spot, dt);
      else { e.pos = { x: spot.x, y: spot.y }; e.setState('hold', this.bus); }
    }
    if (e.stateTime > 4) e.setState('hold', this.bus);
  }

  private advance(e: Enemy, dt: number, player: Target | undefined): void {
    const def = e.def;
    e.advanceRecheck -= dt;
    if (e.advanceRecheck <= 0) {
      e.advanceRecheck = 1;
      const anchor = e.lastKnown ?? player?.pos;
      if (anchor) {
        const spot = this.chooseSpot(e, anchor, 'any', null);
        if (spot) { e.spot = spot; e.setState('seek', this.bus); return; }
      }
    }
    if (e.canSee && player) {
      this.fireLogic(e, dt, player);
      const d = dist(e.pos, player.pos);
      if (d > def.engageIdeal) this.moveAlongPath(e, player.pos, dt, 1);
      else if (d < def.retreatDistance) this.moveAway(e, player.pos, dt);
    } else if (e.lastKnown) {
      if (e.lostTimer > def.lostSightSearchAfter) { e.setState('search', this.bus); return; }
      this.moveAlongPath(e, e.lastKnown, dt, 1);
    } else {
      e.setState('patrol', this.bus);
    }
  }

  private search(e: Enemy, dt: number): void {
    if (e.canSee) { e.setState('alert', this.bus); return; }
    const lk = e.lastKnown;
    if (!lk) { e.setState('patrol', this.bus); return; }
    if (dist(e.pos, lk) > 10) { this.moveAlongPath(e, lk, dt, 1); return; }
    if (e.stateTime > e.def.searchGiveUp + 2) { e.lastKnown = null; e.setState('patrol', this.bus); }
    else e.facing += 1.2 * dt; // look around
  }

  // ---------------- firing ----------------

  private fireLogic(e: Enemy, dt: number, player: Target | undefined): void {
    if (!player || !e.canSee) { e.burstRemaining = 0; return; }
    const def = e.def;
    e.facing = Math.atan2(player.pos.y - e.pos.y, player.pos.x - e.pos.x);
    if (e.firstShotTimer > 0) { e.firstShotTimer -= dt; return; }
    if (e.fireCooldown > 0) return;
    if (e.burstRemaining <= 0) {
      e.burstRemaining = def.burstCount;
      e.burstTimer = 0;
    }
    e.burstTimer -= dt;
    if (e.burstTimer <= 0) {
      this.shoot(e, player);
      e.burstRemaining--;
      e.burstTimer = def.burstInterval;
      if (e.burstRemaining <= 0) e.fireCooldown = def.burstCooldown;
    }
  }

  private shoot(e: Enemy, player: Target): void {
    const def = e.def;
    const w = this.tuning.data.weapons[def.weapon];
    const acc = Math.max(0, Math.min(1, def.accuracy));
    const spreadDeg = lerp(def.spreadAtZeroAccuracy, def.spreadAtFullAccuracy, acc) + w.spread;
    const base = Math.atan2(player.pos.y - e.pos.y, player.pos.x - e.pos.x);
    const angle = base + this.rng.range(-spreadDeg / 2, spreadDeg / 2) * DEG;
    const mx = e.pos.x + Math.cos(angle) * (def.radius + 8);
    const my = e.pos.y + Math.sin(angle) * (def.radius + 8);
    this.bus.emit('weapon:fired', { ownerId: e.id, team: 'enemy', weaponId: def.weapon, x: mx, y: my, angle, shake: w.shake, cursed: false });
    this.projectiles.spawn({ x: mx, y: my, angle, speed: w.projectileSpeed, damage: w.damage, range: w.range, knockback: w.knockback, team: 'enemy', ownerId: e.id, visual: w.visual });
  }

  // ---------------- cover selection ----------------

  private chooseSpot(e: Enemy, threat: Vec2, pref: 'any' | 'closer' | 'farther', exclude: CoverSpot | null): CoverSpot | null {
    const def = e.def;
    let best: CoverSpot | null = null;
    let bestCost = Infinity;
    const others = this.enemies.filter((o) => o !== e && o.alive && o.spot);
    for (const s of this.arena.coverSpots) {
      if (s === exclude) continue;
      if (segmentRect(s.x, s.y, threat.x, threat.y, s.cover.rect) < 0) continue; // cover must lie between
      const d = dist(s, threat);
      if (d < def.engageMin || d > def.engageMax) continue;
      let cost = Math.abs(d - def.engageIdeal) / 100 + dist(e.pos, s) / 160;
      if (pref === 'closer') cost += d / 120;
      if (pref === 'farther') cost -= d / 250;
      const bearing = Math.atan2(s.y - threat.y, s.x - threat.x);
      for (const o of others) {
        const os = o.spot!;
        if (dist(os, s) < 40) cost += 3;
        const ob = Math.atan2(os.y - threat.y, os.x - threat.x);
        if (Math.abs(angleDiff(bearing, ob)) < def.flankAngle * DEG) cost += 1.5;
      }
      if (cost < bestCost) { bestCost = cost; best = s; }
    }
    return best;
  }

  private findPeekPoint(e: Enemy, spot: CoverSpot, threat: Vec2): Vec2 | null {
    const def = e.def;
    // Perpendicular to the cover normal: slide along the cover face, then out past its edge.
    const px = -spot.ny;
    const py = spot.nx;
    const candidates: Vec2[] = [];
    for (const sign of [1, -1]) {
      for (const k of [0.6, 1, 1.5]) {
        candidates.push({ x: spot.x + px * sign * def.peekOffset * k, y: spot.y + py * sign * def.peekOffset * k });
      }
    }
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (const c of candidates) {
      if (!this.arena.isWalkable(c, def.radius)) continue;
      if (!this.arena.walkClear(e.pos, c, def.radius)) continue;
      if (!this.arena.hasLineOfSight(c, threat)) continue;
      const d = dist(spot, c);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // ---------------- movement ----------------

  private moveAlongPath(e: Enemy, goal: Vec2, dt: number, speedMul: number): void {
    const def = e.def;
    const stale = !e.pathGoal || dist(e.pathGoal, goal) > 24 || e.pathTimer <= 0;
    if (stale) {
      e.path = this.arena.findPath(e.pos, goal, def.radius);
      e.pathGoal = { ...goal };
      e.pathTimer = def.pathRepath;
    }
    const next = e.path[0] ?? goal;
    if (e.path.length && dist(e.pos, next) < 6) { e.path.shift(); return; }
    this.moveDirect(e, next, dt, speedMul);
  }

  private moveDirect(e: Enemy, to: Vec2, dt: number, speedMul = 1): void {
    const def = e.def;
    const dir = normalize(to.x - e.pos.x, to.y - e.pos.y);
    const step = Math.min(def.speed * speedMul * dt, dist(e.pos, to));
    if (step <= 0) return;
    e.pos = moveCircle(e.pos, def.radius, dir.x * step, dir.y * step, this.arena.solids, this.arena.bounds);
    if (!e.canSee) e.facing = Math.atan2(dir.y, dir.x);
  }

  private moveAway(e: Enemy, from: Vec2, dt: number): void {
    const def = e.def;
    const dir = normalize(e.pos.x - from.x, e.pos.y - from.y);
    e.pos = moveCircle(e.pos, def.radius, dir.x * def.speed * dt, dir.y * def.speed * dt, this.arena.solids, this.arena.bounds);
  }

  private separate(): void {
    const n = this.enemies.length;
    for (let i = 0; i < n; i++) {
      const a = this.enemies[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.enemies[j];
        const minD = a.def.radius + b.def.radius;
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const d = Math.hypot(dx, dy);
        if (d >= minD || d === 0) continue;
        const push = (minD - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.pos = moveCircle(a.pos, a.def.radius, -nx * push, -ny * push, this.arena.solids, this.arena.bounds);
        b.pos = moveCircle(b.pos, b.def.radius, nx * push, ny * push, this.arena.solids, this.arena.bounds);
      }
    }
  }

  private updatePickups(dt: number, player: Target | undefined): void {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.age += dt;
      if (player && dist(p, player.pos) < player.radius + 8) {
        if (p.pistol) this.bus.emit('pickup:collected', { kind: 'pistol', amount: p.pistol, x: p.x, y: p.y });
        if (p.rifle) this.bus.emit('pickup:collected', { kind: 'rifle', amount: p.rifle, x: p.x, y: p.y });
        this.pickups.splice(i, 1);
      }
    }
  }
}
