/** Shapes of the JSON data files. Keep in sync with src/data/*.json. */
import type { Vec2 } from './math';

export type WeaponKind = 'melee' | 'projectile';

export interface WeaponDef {
  name: string;
  kind: WeaponKind;
  damage: number;
  range: number;
  /** Shots per second. */
  fireRate: number;
  /** 0 = no clip, never reloads (melee or enemy weapons). */
  clipSize: number;
  reloadTime: number;
  /** Degrees, total cone. */
  spread: number;
  projectileSpeed: number;
  /** Degrees, total arc, melee only. */
  meleeArc: number;
  ammoType: string;
  switchTime: number;
  shake: number;
  knockback: number;
  visual: string;
  sounds: Record<string, string>;
}

export interface DodgeDef {
  duration: number;
  speed: number;
  staminaCost: number;
  invulnWindow: number;
}

export interface PlayerDef {
  radius: number;
  speed: number;
  sprintMultiplier: number;
  maxHealth: number;
  maxStamina: number;
  staminaDrainSprint: number;
  staminaRegen: number;
  staminaRegenDelay: number;
  maxGrit: number;
  dodge: DodgeDef;
  startingWeapons: string[];
  startingAmmo: Record<string, number>;
  maxAmmo: Record<string, number>;
  visual: string;
  hitFlash: number;
  sounds: Record<string, string>;
}

export interface EnemyDef {
  name: string;
  radius: number;
  health: number;
  speed: number;
  weapon: string;
  accuracy: number;
  spreadAtZeroAccuracy: number;
  spreadAtFullAccuracy: number;
  visionRange: number;
  visionCone: number;
  hearingRange: number;
  reactionTime: number;
  burstCount: number;
  burstInterval: number;
  burstCooldown: number;
  firstShotDelay: number;
  engageMin: number;
  engageIdeal: number;
  engageMax: number;
  retreatDistance: number;
  advanceAfter: number;
  peekOffset: number;
  flankAngle: number;
  lostSightSearchAfter: number;
  searchGiveUp: number;
  pathRepath: number;
  hitFlash: number;
  drop: { kind: string; pistol: number; rifle: number; chance: number };
  visual: string;
  sounds: Record<string, string>;
}

export interface SpellDef {
  name: string;
  cost: number;
  status: 'burn';
  burn: { damagePerSecond: number; duration: number; tickInterval: number };
  visual: string;
  sounds: Record<string, string>;
}

export type CoverType = 'wall' | 'crate' | 'fence' | 'low';

export interface CoverDef {
  id: string;
  type: CoverType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Visual override for this object; defaults to the cover type's visual. */
  visual?: string;
}

export interface CoverTypeDef {
  blocksMove: boolean;
  blocksShots: boolean;
  blocksSight: boolean;
  visual: string;
}

export interface ArenaDef {
  tileSize: number;
  widthTiles: number;
  heightTiles: number;
  playerSpawn: Vec2;
  cover: CoverDef[];
  coverTypes: Record<string, CoverTypeDef>;
  patrolRoutes: Vec2[][];
  coverSpot: { offset: number; spacing: number };
  /** A shot fired within this distance of a `low` cover ignores it (fires over it). */
  overCoverDistance: number;
}

/**
 * A visual is what an entity or cover looks like. Four kinds:
 *  shape   placeholder rectangle/circle
 *  sprite  single image (rotates to facing)
 *  sprite4 one cell per facing from a sheet; `left` may be "flip" of right
 *  tile    a block of sheet cells tiled across a rect (cover, floor)
 *  floor   base tile plus weighted patches, rendered once to a cache
 */
export interface VisualDef {
  type: 'shape' | 'sprite' | 'sprite4' | 'tile' | 'floor';
  shape?: 'circle' | 'rect' | 'arc' | 'ring' | 'grid';
  color?: string;
  outline?: string;
  line?: string;
  size?: number;
  facing?: boolean;
  facingColor?: string;
  trail?: number;
  pattern?: string;
  src?: string;
  frameW?: number;
  frameH?: number;
  /** sprite4 / tile: sheet under public/sprites, without extension. */
  sheet?: string;
  /** sprite4: cell [col,row] per facing. */
  dirs?: { right: [number, number]; left: [number, number] | 'flip'; down: [number, number]; up: [number, number] };
  /** tile: block origin in cells and block size in cells (default 1×1). */
  col?: number;
  row?: number;
  cols?: number;
  rows?: number;
  /** tile: pixel-rect source instead of cells (for autotile interiors). */
  px?: number;
  py?: number;
  pw?: number;
  ph?: number;
  /** tile: rotate each cell by 0/90/180/270 degrees. */
  rotate?: number;
  /** floor: base tile visual key and random patches. */
  base?: string;
  patches?: Array<{ visual: string; weight: number }>;
  seed?: number;
  /** Shadow ellipse under characters. */
  shadow?: boolean;
}

export interface GameData {
  weapons: Record<string, WeaponDef>;
  enemies: Record<string, EnemyDef>;
  player: PlayerDef;
  spells: Record<string, SpellDef>;
  arena: ArenaDef;
  visuals: Record<string, VisualDef>;
  sounds: Record<string, string>;
}
