/**
 * The test field. Owns cover geometry, movement colliders, line-of-sight and
 * shot-blocking queries, precomputed cover spots for the AI, and a tile grid
 * with A* for pathing. Reads everything from arena.json via the tuning store.
 */
import { type Rect, type Vec2, segmentRect, pointRectDistance, expandRect, circleRectOverlap, dist } from '../core/math';
import type { ArenaDef, CoverDef, CoverTypeDef } from '../core/types';

export interface Cover extends CoverDef {
  rect: Rect;
  rules: CoverTypeDef;
}

export interface CoverSpot {
  x: number;
  y: number;
  cover: Cover;
  /** Outward normal of the side this spot sits on. */
  nx: number;
  ny: number;
}

export interface ShotHit {
  cover: Cover;
  t: number;
}

export class Arena {
  readonly tileSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly bounds: Rect;
  readonly covers: Cover[];
  readonly solids: Rect[];
  readonly shotBlockers: Cover[];
  readonly sightBlockers: Cover[];
  readonly coverSpots: CoverSpot[];
  /** true = blocked, indexed [row * cols + col]. Built for a 12 px radius mover. */
  private blocked: Uint8Array;
  private readonly moverRadius = 12;

  constructor(public readonly def: ArenaDef) {
    this.tileSize = def.tileSize;
    this.cols = def.widthTiles;
    this.rows = def.heightTiles;
    this.bounds = { x: 0, y: 0, w: this.cols * this.tileSize, h: this.rows * this.tileSize };
    this.covers = def.cover.map((c) => ({ ...c, rect: { x: c.x, y: c.y, w: c.w, h: c.h }, rules: def.coverTypes[c.type] }));
    this.solids = this.covers.filter((c) => c.rules.blocksMove).map((c) => c.rect);
    this.shotBlockers = this.covers.filter((c) => c.rules.blocksShots);
    this.sightBlockers = this.covers.filter((c) => c.rules.blocksSight);
    this.blocked = this.buildGrid();
    this.coverSpots = this.buildCoverSpots();
  }

  get width(): number { return this.bounds.w; }
  get height(): number { return this.bounds.h; }

  inBounds(p: Vec2): boolean {
    return p.x >= 0 && p.y >= 0 && p.x <= this.bounds.w && p.y <= this.bounds.h;
  }

  /** Sight passes over `low` and through `fence`; blocked by walls and crates. */
  hasLineOfSight(a: Vec2, b: Vec2): boolean {
    for (const c of this.sightBlockers) {
      if (segmentRect(a.x, a.y, b.x, b.y, c.rect) >= 0) return false;
    }
    return true;
  }

  /**
   * First shot-blocking cover along a segment, if any. A `low` cover is
   * ignored when the shot originated within `overCoverDistance` of it
   * (the shooter is leaning on it and fires over).
   */
  firstShotBlocker(ax: number, ay: number, bx: number, by: number, origin: Vec2): ShotHit | null {
    let best: ShotHit | null = null;
    const over = this.def.overCoverDistance;
    for (const c of this.shotBlockers) {
      if (!c.rules.blocksSight && pointRectDistance(origin, c.rect) <= over) continue;
      const t = segmentRect(ax, ay, bx, by, c.rect);
      if (t >= 0 && (!best || t < best.t)) best = { cover: c, t };
    }
    return best;
  }

  /** Does a straight shot from a to b get stopped by cover? */
  shotBlocked(a: Vec2, b: Vec2): boolean {
    return this.firstShotBlocker(a.x, a.y, b.x, b.y, a) !== null;
  }

  /** Can a circle of `radius` stand at p without overlapping a solid or leaving bounds? */
  isWalkable(p: Vec2, radius: number): boolean {
    if (p.x < radius || p.y < radius || p.x > this.bounds.w - radius || p.y > this.bounds.h - radius) return false;
    for (const r of this.solids) if (circleRectOverlap(p.x, p.y, radius, r)) return false;
    return true;
  }

  /** Straight walk from a to b with no solid in the way (used for path smoothing). */
  walkClear(a: Vec2, b: Vec2, radius: number): boolean {
    for (const r of this.solids) {
      if (segmentRect(a.x, a.y, b.x, b.y, expandRect(r, radius)) >= 0) return false;
    }
    return true;
  }

  tileOf(p: Vec2): { c: number; r: number } {
    return { c: Math.floor(p.x / this.tileSize), r: Math.floor(p.y / this.tileSize) };
  }

  tileCenter(c: number, r: number): Vec2 {
    return { x: (c + 0.5) * this.tileSize, y: (r + 0.5) * this.tileSize };
  }

  isTileBlocked(c: number, r: number): boolean {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return this.blocked[r * this.cols + c] === 1;
  }

  private buildGrid(): Uint8Array {
    const g = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.tileCenter(c, r);
        if (!this.isWalkable(p, this.moverRadius)) g[r * this.cols + c] = 1;
      }
    }
    return g;
  }

  /**
   * A* on the tile grid, 8-connected with no corner cutting, then smoothed by
   * skipping to the furthest waypoint reachable in a straight walk. Returns
   * world-space waypoints excluding the start; empty if unreachable.
   */
  findPath(from: Vec2, to: Vec2, radius: number): Vec2[] {
    const s = this.tileOf(from);
    const g = this.nearestOpenTile(this.tileOf(to));
    if (!g) return [];
    const start = s.r * this.cols + s.c;
    const goal = g.r * this.cols + g.c;
    if (start === goal) return this.walkClear(from, to, radius) ? [to] : [];

    const n = this.cols * this.rows;
    const gScore = new Float32Array(n).fill(Infinity);
    const fScore = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open: number[] = [start];
    const h = (i: number) => {
      const dc = Math.abs((i % this.cols) - g.c);
      const dr = Math.abs(Math.floor(i / this.cols) - g.r);
      return Math.max(dc, dr) + 0.41421 * Math.min(dc, dr);
    };
    gScore[start] = 0;
    fScore[start] = h(start);

    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[bi]]) bi = i;
      const cur = open[bi];
      if (cur === goal) break;
      open[bi] = open[open.length - 1];
      open.pop();
      closed[cur] = 1;
      const cc = cur % this.cols;
      const cr = Math.floor(cur / this.cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = cc + dc;
          const nr = cr + dr;
          if (this.isTileBlocked(nc, nr)) continue;
          if (dr && dc && (this.isTileBlocked(cc + dc, cr) || this.isTileBlocked(cc, cr + dr))) continue;
          const ni = nr * this.cols + nc;
          if (closed[ni]) continue;
          const tentative = gScore[cur] + (dr && dc ? 1.41421 : 1);
          if (tentative < gScore[ni]) {
            came[ni] = cur;
            gScore[ni] = tentative;
            fScore[ni] = tentative + h(ni);
            if (!open.includes(ni)) open.push(ni);
          }
        }
      }
    }
    if (came[goal] === -1 && start !== goal) return [];

    const tiles: Vec2[] = [];
    for (let i = goal; i !== -1 && i !== start; i = came[i]) tiles.push(this.tileCenter(i % this.cols, Math.floor(i / this.cols)));
    tiles.reverse();
    tiles.push(to);

    // smoothing
    const out: Vec2[] = [];
    let anchor = from;
    let i = 0;
    while (i < tiles.length) {
      let j = tiles.length - 1;
      while (j > i && !this.walkClear(anchor, tiles[j], radius)) j--;
      out.push(tiles[j]);
      anchor = tiles[j];
      i = j + 1;
    }
    return out;
  }

  private nearestOpenTile(t: { c: number; r: number }): { c: number; r: number } | null {
    if (!this.isTileBlocked(t.c, t.r)) return t;
    for (let ring = 1; ring <= 3; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          if (!this.isTileBlocked(t.c + dc, t.r + dr)) return { c: t.c + dc, r: t.r + dr };
        }
      }
    }
    return null;
  }

  /** Points hugging each side of every shot-blocking cover. */
  private buildCoverSpots(): CoverSpot[] {
    const spots: CoverSpot[] = [];
    const { offset, spacing } = this.def.coverSpot;
    for (const cover of this.shotBlockers) {
      const r = cover.rect;
      const sides: Array<{ nx: number; ny: number; ax: number; ay: number; bx: number; by: number }> = [
        { nx: 0, ny: -1, ax: r.x, ay: r.y - offset, bx: r.x + r.w, by: r.y - offset },
        { nx: 0, ny: 1, ax: r.x, ay: r.y + r.h + offset, bx: r.x + r.w, by: r.y + r.h + offset },
        { nx: -1, ny: 0, ax: r.x - offset, ay: r.y, bx: r.x - offset, by: r.y + r.h },
        { nx: 1, ny: 0, ax: r.x + r.w + offset, ay: r.y, bx: r.x + r.w + offset, by: r.y + r.h },
      ];
      for (const s of sides) {
        const length = dist({ x: s.ax, y: s.ay }, { x: s.bx, y: s.by });
        const count = Math.max(1, Math.floor(length / spacing));
        for (let i = 0; i < count; i++) {
          const t = count === 1 ? 0.5 : (i + 0.5) / count;
          const p = { x: s.ax + (s.bx - s.ax) * t, y: s.ay + (s.by - s.ay) * t };
          if (!this.isWalkable(p, this.moverRadius + 2)) continue;
          spots.push({ x: p.x, y: p.y, cover, nx: s.nx, ny: s.ny });
        }
      }
    }
    return spots;
  }
}
