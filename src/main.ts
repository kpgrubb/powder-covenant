/**
 * Composition root. Builds every system, wires the event bus, turns raw input
 * into a PlayerIntent, and exposes `window.__game` for Playwright and manual
 * poking. This is the only file that knows about all systems at once.
 */
import weaponsJson from './data/weapons.json';
import enemiesJson from './data/enemies.json';
import playerJson from './data/player.json';
import spellsJson from './data/spells.json';
import arenaJson from './data/arena.json';
import visualsJson from './data/visuals.json';
import soundsJson from './data/sounds.json';

import { EventBus } from './core/events';
import { GameLoop } from './core/loop';
import { Input } from './core/input';
import { Rng } from './core/math';
import { Tuning } from './core/tuning';
import type { GameData } from './core/types';
import { Arena } from './world/arena';
import { TargetRegistry } from './entities/combatant';
import { Player, idleIntent, type PlayerIntent } from './entities/player';
import { ProjectileSystem } from './weapons/projectiles';
import { MeleeSystem } from './weapons/melee';
import { SpellSystem } from './magic/cursedShot';
import { EnemySystem } from './enemies/enemy';
import { AudioHooks } from './fx/audio';
import { Feedback } from './fx/feedback';
import { Renderer } from './render/renderer';
import { Hud } from './ui/hud';
import { DebugPanel } from './ui/debugPanel';

export function buildData(): GameData {
  return {
    weapons: weaponsJson as GameData['weapons'],
    enemies: enemiesJson as GameData['enemies'],
    player: playerJson as GameData['player'],
    spells: spellsJson as GameData['spells'],
    arena: arenaJson as GameData['arena'],
    visuals: visualsJson as unknown as GameData['visuals'],
    sounds: soundsJson as GameData['sounds'],
  };
}

export class Game {
  readonly bus = new EventBus();
  readonly rng = new Rng(1337);
  readonly tuning: Tuning;
  readonly arena: Arena;
  readonly registry = new TargetRegistry();
  readonly projectiles: ProjectileSystem;
  readonly melee: MeleeSystem;
  readonly spells: SpellSystem;
  readonly player: Player;
  readonly enemies: EnemySystem;
  readonly audio: AudioHooks;
  readonly feedback: Feedback;
  readonly renderer: Renderer | null;
  readonly hud: Hud | null;
  readonly panel: DebugPanel | null;
  readonly input: Input;
  readonly loop: GameLoop;
  /** Intent override for automation; when set, raw input is ignored. */
  scriptedIntent: PlayerIntent | null = null;
  time = 0;

  constructor(canvas: HTMLCanvasElement | null, doc: Document | null) {
    this.tuning = new Tuning(buildData(), this.bus);
    this.arena = new Arena(this.tuning.data.arena);
    this.projectiles = new ProjectileSystem(this.bus, this.arena, this.registry);
    this.melee = new MeleeSystem(this.bus, this.arena, this.registry);
    this.audio = new AudioHooks(this.tuning.data.sounds);
    this.feedback = new Feedback(this.bus, this.tuning, this.audio, this.rng);
    // Player needs the spell system, the spell system needs the player's Grit. Resolve via a late-bound source.
    let playerRef: Player | null = null;
    this.spells = new SpellSystem(this.bus, this.tuning, { get grit() { return playerRef?.grit ?? 0; }, spend: (n) => playerRef?.spend(n) ?? false });
    this.player = new Player(this.bus, this.tuning, this.arena, this.projectiles, this.melee, this.spells, this.registry, this.rng);
    playerRef = this.player;
    this.feedback.playerId = this.player.id;
    this.enemies = new EnemySystem(this.bus, this.tuning, this.arena, this.projectiles, this.registry, this.rng, (x, y) => this.feedback.ember(x, y));
    this.input = new Input(canvas);
    this.renderer = canvas ? new Renderer(canvas, this.tuning, this.arena, this.player.pos) : null;
    this.hud = doc ? new Hud(doc) : null;
    this.panel = doc ? new DebugPanel(doc.getElementById('debug')!, this.tuning, {
      spawn: (n) => { for (let i = 0; i < n; i++) this.spawnEnemy(); },
      killAll: () => this.enemies.clear(),
      reset: () => this.resetArena(),
    }) : null;
    this.loop = new GameLoop({ update: (dt) => this.update(dt), render: () => this.render() }, 60);
  }

  spawnEnemy() { return this.enemies.spawn('regular'); }

  resetArena(): void {
    this.enemies.clear();
    this.projectiles.clear();
    this.feedback.clear();
    this.player.reset();
    this.bus.emit('arena:reset', {});
  }

  /** Translate raw input into intent. Automation can bypass with scriptedIntent. */
  private readIntent(): PlayerIntent {
    if (this.scriptedIntent) return this.scriptedIntent;
    const i = this.input;
    const intent = idleIntent();
    intent.move.x = (i.down('KeyD') ? 1 : 0) - (i.down('KeyA') ? 1 : 0);
    intent.move.y = (i.down('KeyS') ? 1 : 0) - (i.down('KeyW') ? 1 : 0);
    intent.aim = this.renderer ? this.renderer.camera.toWorld(i.mouse.x, i.mouse.y) : { x: this.player.pos.x + 1, y: this.player.pos.y };
    intent.firePressed = i.firePressed();
    intent.reload = i.pressed('KeyR');
    intent.dodge = i.pressed('Space');
    intent.sprint = i.down('ShiftLeft') || i.down('ShiftRight');
    intent.cast = i.pressed('KeyQ');
    if (i.pressed('Digit1')) intent.switchTo = 0;
    if (i.pressed('Digit2')) intent.switchTo = 1;
    if (i.pressed('Digit3')) intent.switchTo = 2;
    return intent;
  }

  update(dt: number): void {
    this.time += dt;
    const i = this.input;
    if (i.pressed('KeyN')) this.spawnEnemy();
    if (i.pressed('KeyF')) this.player.refillGrit();
    if (i.pressed('Backquote')) this.panel?.toggle();
    if (i.pressed('Enter') && !this.player.alive) this.resetArena();

    const intent = this.readIntent();
    this.player.update(dt, intent);
    this.enemies.update(dt);
    this.projectiles.update(dt);
    this.melee.update(dt);
    this.feedback.update(dt);
    this.renderer?.camera.follow(this.player.pos, dt, this.arena.bounds);
    i.endTick();
  }

  render(): void {
    this.renderer?.draw({
      player: this.player,
      enemies: this.enemies.enemies,
      pickups: this.enemies.pickups,
      projectiles: this.projectiles.list,
      swings: this.melee.swings,
      feedback: this.feedback,
      cursedArmed: this.spells.armed !== null,
    });
    this.hud?.update(this.player, {
      fps: this.loop.fps,
      enemies: this.enemies.aliveCount,
      cursedArmed: this.spells.armed !== null,
      panelHint: this.panel?.visible ? '' : '` tuning   N spawn   F grit   Q curse',
    });
  }

  /** Step the simulation without rendering (tests / automation). */
  step(seconds: number): void { this.loop.step(seconds); }
}

declare global {
  interface Window { __game: Game }
}

if (typeof document !== 'undefined' && document.getElementById('game')) {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const fit = () => {
    const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height)));
    canvas.style.width = `${canvas.width * scale}px`;
    canvas.style.height = `${canvas.height * scale}px`;
  };
  fit();
  window.addEventListener('resize', fit);
  const game = new Game(canvas, document);
  window.__game = game;
  game.loop.start();
}
