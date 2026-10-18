import { describe, it, expect } from 'vitest';
import { Arena } from '../src/world/arena';
import { segmentRect, segmentCircle, moveCircle } from '../src/core/math';
import arenaJson from '../src/data/arena.json';
import type { ArenaDef } from '../src/core/types';

const arena = new Arena(arenaJson as ArenaDef);

describe('segment geometry', () => {
  it('segmentRect hits and misses', () => {
    const r = { x: 10, y: 10, w: 10, h: 10 };
    expect(segmentRect(0, 15, 30, 15, r)).toBeCloseTo(1 / 3);
    expect(segmentRect(0, 0, 5, 5, r)).toBe(-1);
    expect(segmentRect(15, 0, 15, 5, r)).toBe(-1);
    expect(segmentRect(15, 15, 40, 15, r)).toBe(0); // starts inside
  });
  it('segmentCircle', () => {
    expect(segmentCircle(0, 0, 10, 0, 5, 0, 1)).toBeCloseTo(0.4);
    expect(segmentCircle(0, 0, 10, 0, 5, 3, 1)).toBe(-1);
  });
  it('moveCircle slides along a wall', () => {
    const wall = { x: 50, y: 0, w: 10, h: 100 };
    const p = moveCircle({ x: 30, y: 50 }, 5, 40, 10, [wall], { x: 0, y: 0, w: 200, h: 200 });
    expect(p.x).toBeCloseTo(45);
    expect(p.y).toBeCloseTo(60);
  });
});

describe('Arena cover rules', () => {
  const wall = arena.covers.find((c) => c.id === 'wall_mid')!;
  const low = arena.covers.find((c) => c.id === 'sandbags_a')!;
  const fence = arena.covers.find((c) => c.id === 'fence_2')!;

  it('walls block sight and shots', () => {
    const a = { x: wall.rect.x + 20, y: wall.rect.y - 40 };
    const b = { x: wall.rect.x + 20, y: wall.rect.y + wall.rect.h + 40 };
    expect(arena.hasLineOfSight(a, b)).toBe(false);
    expect(arena.shotBlocked(a, b)).toBe(true);
  });

  it('sandbags block shots but not sight', () => {
    const a = { x: low.rect.x + 20, y: low.rect.y - 60 };
    const b = { x: low.rect.x + 20, y: low.rect.y + low.rect.h + 60 };
    expect(arena.hasLineOfSight(a, b)).toBe(true);
    expect(arena.shotBlocked(a, b)).toBe(true);
  });

  it('a shooter leaning on sandbags fires over them', () => {
    const over = arenaJson.overCoverDistance;
    const a = { x: low.rect.x + 20, y: low.rect.y - (over - 2) };
    const b = { x: low.rect.x + 20, y: low.rect.y + low.rect.h + 120 };
    expect(arena.firstShotBlocker(a.x, a.y, b.x, b.y, a)).toBeNull();
    // but the return fire from far away is stopped
    expect(arena.firstShotBlocker(b.x, b.y, a.x, a.y, b)?.cover.id).toBe('sandbags_a');
  });

  it('fences block movement only', () => {
    const a = { x: fence.rect.x + 10, y: fence.rect.y - 40 };
    const b = { x: fence.rect.x + 10, y: fence.rect.y + 40 };
    expect(arena.hasLineOfSight(a, b)).toBe(true);
    expect(arena.shotBlocked(a, b)).toBe(false);
    expect(arena.walkClear(a, b, 12)).toBe(false);
  });

  it('cover spots exist for every shot-blocking cover and are walkable', () => {
    const ids = new Set(arena.coverSpots.map((s) => s.cover.id));
    for (const c of arena.shotBlockers) expect(ids.has(c.id)).toBe(true);
    for (const s of arena.coverSpots) expect(arena.isWalkable(s, 12)).toBe(true);
  });

  it('A* finds a path around the mid wall', () => {
    const from = { x: wall.rect.x + 60, y: wall.rect.y - 80 };
    const to = { x: wall.rect.x + 60, y: wall.rect.y + wall.rect.h + 80 };
    const path = arena.findPath(from, to, 12);
    expect(path.length).toBeGreaterThan(1);
    expect(path[path.length - 1]).toEqual(to);
    let prev = from;
    for (const p of path) { expect(arena.walkClear(prev, p, 12)).toBe(true); prev = p; }
  });
});
