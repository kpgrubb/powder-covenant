/**
 * Typed event bus. Systems never call each other directly; they emit and
 * subscribe here. Event names and payloads are declared in GameEvents so a
 * typo is a compile error.
 */
import type { Vec2 } from './math';

export type Team = 'player' | 'enemy';
export type StatusKind = 'burn';

export interface GameEvents {
  // weapons
  'weapon:fired': { ownerId: number; team: Team; weaponId: string; x: number; y: number; angle: number; shake: number; cursed: boolean };
  'weapon:reload-start': { ownerId: number; weaponId: string };
  'weapon:reload-done': { ownerId: number; weaponId: string };
  'weapon:reload-interrupted': { ownerId: number; weaponId: string };
  'weapon:switched': { ownerId: number; weaponId: string };
  'weapon:empty': { ownerId: number; weaponId: string };
  // damage
  'hit': { targetId: number; sourceId: number; team: Team; amount: number; x: number; y: number; status?: StatusKind; kind: 'projectile' | 'melee' | 'status' };
  'cover-hit': { x: number; y: number; coverId: string; team: Team };
  'entity:damaged': { id: number; team: Team; amount: number; health: number; x: number; y: number };
  'entity:died': { id: number; team: Team; x: number; y: number };
  // player
  'player:dodge': { x: number; y: number };
  'player:grit-changed': { grit: number; max: number };
  // spells
  'spell:cast': { spellId: string; cost: number };
  'spell:failed': { spellId: string; reason: 'grit' | 'already-armed' };
  'spell:consumed': { spellId: string };
  // enemies
  'enemy:spawned': { id: number; x: number; y: number };
  'enemy:state': { id: number; state: string };
  'enemy:alerted': { id: number; x: number; y: number };
  'pickup:collected': { kind: string; amount: number; x: number; y: number };
  'noise': { x: number; y: number; radius: number; team: Team };
  // tuning
  'tuning:changed': { path: string; value: number | boolean };
  'tuning:reset': Record<string, never>;
  // misc
  'arena:reset': Record<string, never>;
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(name: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(fn as Handler<unknown>);
    return () => set!.delete(fn as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(name: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export type { Vec2 };
