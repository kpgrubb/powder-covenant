/**
 * DOM HUD: resource bars, hotbar with ammo and reload state, status readout.
 * Read-only view of the player; never mutates game state.
 */
import type { Player } from '../entities/player';

export class Hud {
  private bars: Record<'health' | 'stamina' | 'grit', { fill: HTMLElement; label: HTMLElement }>;
  private hotbar: HTMLElement;
  private status: HTMLElement;
  private death: HTMLElement;
  private slots: HTMLElement[] = [];

  constructor(root: Document) {
    const bar = (cls: string) => {
      const el = root.querySelector(`#hud .bar.${cls}`)!;
      return { fill: el.querySelector('i') as HTMLElement, label: el.querySelector('span') as HTMLElement };
    };
    this.bars = { health: bar('health'), stamina: bar('stamina'), grit: bar('grit') };
    this.hotbar = root.getElementById('hotbar')!;
    this.status = root.getElementById('status')!;
    this.death = root.getElementById('death')!;
  }

  update(player: Player, extra: { fps: number; enemies: number; cursedArmed: boolean; panelHint: string }): void {
    this.setBar('health', player.health, player.maxHealth, 'HP');
    this.setBar('stamina', player.stamina, player.maxStamina, 'STA');
    this.setBar('grit', player.grit, player.maxGrit, 'GRIT');

    if (this.slots.length !== player.weapons.length) {
      this.hotbar.innerHTML = '';
      this.slots = player.weapons.map((_, i) => {
        const s = document.createElement('div');
        s.className = 'slot';
        s.innerHTML = `<span class="name"></span><span class="ammo"></span><span class="state"></span>`;
        s.dataset.index = String(i + 1);
        this.hotbar.appendChild(s);
        return s;
      });
    }
    player.weapons.forEach((w, i) => {
      const s = this.slots[i];
      const active = i === player.activeIndex;
      s.classList.toggle('active', active);
      (s.querySelector('.name') as HTMLElement).textContent = `${i + 1} ${w.def.name}`;
      const ammoEl = s.querySelector('.ammo') as HTMLElement;
      ammoEl.textContent = w.hasClip ? `${w.clip}/${w.def.clipSize}  |${player.ammo.reserve[w.def.ammoType] ?? 0}` : '—';
      const st = s.querySelector('.state') as HTMLElement;
      let state = '';
      if (w.reloading) state = `reloading ${Math.round(w.reloadProgress * 100)}%`;
      else if (active && w.switchTimer > 0) state = 'drawing…';
      else if (active && w.hasClip && w.clip === 0) state = (player.ammo.reserve[w.def.ammoType] ?? 0) > 0 ? 'EMPTY — R' : 'NO AMMO';
      else if (active && player.lastFireFail === 'cooldown') state = '';
      st.textContent = state;
    });

    const lines = [
      `fps ${extra.fps}   enemies ${extra.enemies}`,
      extra.cursedArmed ? 'CURSED SHOT ARMED' : '',
      player.sprinting ? 'sprinting' : '',
      extra.panelHint,
    ].filter(Boolean);
    this.status.textContent = lines.join('\n');
    this.death.classList.toggle('show', !player.alive);
  }

  private setBar(k: 'health' | 'stamina' | 'grit', v: number, max: number, label: string): void {
    const b = this.bars[k];
    b.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, max > 0 ? v / max : 0))})`;
    b.label.textContent = `${label} ${Math.ceil(v)}/${max}`;
  }
}
