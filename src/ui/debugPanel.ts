/**
 * Debug tuning panel. Generated from a schema of tuning-store paths, so a new
 * tunable is one line here. Writes go through `Tuning.set`, which is also
 * what tests exercise; this file is only DOM.
 */
import type { Tuning } from '../core/tuning';

export interface TunableRow { label: string; path: string; min: number; max: number; step: number }
export interface TunableGroup { title: string; rows: TunableRow[] }

export const DEBUG_SCHEMA: TunableGroup[] = [
  { title: 'Saber', rows: [
    { label: 'Damage', path: 'weapons.saber.damage', min: 1, max: 200, step: 1 },
    { label: 'Range', path: 'weapons.saber.range', min: 20, max: 120, step: 1 },
    { label: 'Swings/sec', path: 'weapons.saber.fireRate', min: 0.5, max: 8, step: 0.1 },
    { label: 'Arc °', path: 'weapons.saber.meleeArc', min: 30, max: 360, step: 5 },
  ] },
  { title: 'Pistol', rows: [
    { label: 'Damage', path: 'weapons.pistol.damage', min: 1, max: 200, step: 1 },
    { label: 'Reload s', path: 'weapons.pistol.reloadTime', min: 0.2, max: 6, step: 0.1 },
    { label: 'Clip', path: 'weapons.pistol.clipSize', min: 1, max: 30, step: 1 },
    { label: 'Spread °', path: 'weapons.pistol.spread', min: 0, max: 40, step: 0.5 },
    { label: 'Shots/sec', path: 'weapons.pistol.fireRate', min: 0.5, max: 12, step: 0.1 },
    { label: 'Range', path: 'weapons.pistol.range', min: 50, max: 1200, step: 10 },
  ] },
  { title: 'Rifle', rows: [
    { label: 'Damage', path: 'weapons.rifle.damage', min: 1, max: 300, step: 1 },
    { label: 'Reload s', path: 'weapons.rifle.reloadTime', min: 0.2, max: 8, step: 0.1 },
    { label: 'Clip', path: 'weapons.rifle.clipSize', min: 1, max: 10, step: 1 },
    { label: 'Spread °', path: 'weapons.rifle.spread', min: 0, max: 20, step: 0.1 },
    { label: 'Range', path: 'weapons.rifle.range', min: 100, max: 2000, step: 10 },
  ] },
  { title: 'Player', rows: [
    { label: 'Speed', path: 'player.speed', min: 40, max: 400, step: 5 },
    { label: 'Max health', path: 'player.maxHealth', min: 10, max: 500, step: 5 },
    { label: 'Sprint ×', path: 'player.sprintMultiplier', min: 1, max: 3, step: 0.05 },
    { label: 'Dodge speed', path: 'player.dodge.speed', min: 100, max: 900, step: 10 },
    { label: 'Dodge i-frames s', path: 'player.dodge.invulnWindow', min: 0, max: 0.5, step: 0.01 },
  ] },
  { title: 'Magic', rows: [
    { label: 'Cursed Shot cost', path: 'spells.cursedShot.cost', min: 0, max: 100, step: 1 },
    { label: 'Burn dps', path: 'spells.cursedShot.burn.damagePerSecond', min: 0, max: 60, step: 1 },
    { label: 'Burn s', path: 'spells.cursedShot.burn.duration', min: 0.5, max: 15, step: 0.5 },
  ] },
  { title: 'Enemy (regular)', rows: [
    { label: 'Health', path: 'enemies.regular.health', min: 5, max: 500, step: 5 },
    { label: 'Accuracy', path: 'enemies.regular.accuracy', min: 0, max: 1, step: 0.02 },
    { label: 'Speed', path: 'enemies.regular.speed', min: 30, max: 300, step: 5 },
    { label: 'Burst count', path: 'enemies.regular.burstCount', min: 1, max: 10, step: 1 },
    { label: 'Burst cooldown', path: 'enemies.regular.burstCooldown', min: 0.2, max: 5, step: 0.1 },
    { label: 'Carbine dmg', path: 'weapons.carbine_enemy.damage', min: 1, max: 100, step: 1 },
    { label: 'Vision range', path: 'enemies.regular.visionRange', min: 50, max: 900, step: 10 },
  ] },
];

export const DEBUG_FLAGS: Array<{ label: string; path: string }> = [
  { label: 'Damage numbers', path: 'flags.damageNumbers' },
  { label: 'AI debug (cones, states)', path: 'flags.aiDebug' },
  { label: 'Show cover spots', path: 'flags.showCoverSpots' },
  { label: 'God mode', path: 'flags.godMode' },
];

export class DebugPanel {
  private inputs = new Map<string, { range: HTMLInputElement; num: HTMLInputElement }>();
  private checks = new Map<string, HTMLInputElement>();
  visible = false;

  constructor(private root: HTMLElement, private tuning: Tuning, actions: { spawn: (n: number) => void; killAll: () => void; reset: () => void }) {
    root.innerHTML = '';
    const h = document.createElement('div');
    h.innerHTML = `<strong>TUNING</strong> <span style="color:#8d8578">(\` to close)</span>`;
    root.appendChild(h);

    for (const g of DEBUG_SCHEMA) {
      const title = document.createElement('h3');
      title.textContent = g.title;
      root.appendChild(title);
      for (const r of g.rows) root.appendChild(this.row(r));
    }

    const ft = document.createElement('h3');
    ft.textContent = 'Toggles';
    root.appendChild(ft);
    for (const f of DEBUG_FLAGS) {
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('label');
      label.textContent = f.label;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!this.tuning.get(f.path);
      cb.addEventListener('change', () => this.tuning.set(f.path, cb.checked));
      row.append(label, cb);
      root.appendChild(row);
      this.checks.set(f.path, cb);
    }

    const bt = document.createElement('h3');
    bt.textContent = 'Arena';
    root.appendChild(bt);
    const btns = document.createElement('div');
    const mk = (text: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = text; b.addEventListener('click', fn); btns.appendChild(b); };
    mk('Spawn 1', () => actions.spawn(1));
    mk('Spawn 5', () => actions.spawn(5));
    mk('Spawn 20', () => actions.spawn(20));
    mk('Kill all', actions.killAll);
    mk('Reset arena', actions.reset);
    mk('Reset tuning', () => { this.tuning.reset(); this.sync(); });
    root.appendChild(btns);
    this.sync();
  }

  private row(r: TunableRow): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('label');
    label.textContent = r.label;
    const num = document.createElement('input');
    num.type = 'number';
    num.min = String(r.min); num.max = String(r.max); num.step = String(r.step);
    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(r.min); range.max = String(r.max); range.step = String(r.step);
    const apply = (v: number) => {
      if (!Number.isFinite(v)) return;
      this.tuning.set(r.path, v);
      num.value = String(v);
      range.value = String(v);
    };
    range.addEventListener('input', () => apply(parseFloat(range.value)));
    num.addEventListener('change', () => apply(parseFloat(num.value)));
    row.append(label, num, range);
    this.inputs.set(r.path, { range, num });
    return row;
  }

  /** Pull current values from the store into the inputs. */
  sync(): void {
    for (const [path, { range, num }] of this.inputs) {
      const v = this.tuning.get(path);
      if (typeof v === 'number') { range.value = String(v); num.value = String(v); }
    }
    for (const [path, cb] of this.checks) cb.checked = !!this.tuning.get(path);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle('show', this.visible);
    if (this.visible) this.sync();
  }
}
