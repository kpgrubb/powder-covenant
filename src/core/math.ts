export interface Vec2 { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const len = (x: number, y: number): number => Math.hypot(x, y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);
export const angleTo = (from: Vec2, to: Vec2): number => Math.atan2(to.y - from.y, to.x - from.x);

/** Smallest signed difference between two angles, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

export function normalize(x: number, y: number): Vec2 {
  const l = Math.hypot(x, y);
  return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

/** Deterministic PRNG (mulberry32) so weapon math can be unit tested. */
export class Rng {
  private s: number;
  constructor(seed = 0x9e3779b9) { this.s = seed >>> 0; }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number): number { return lo + (hi - lo) * this.next(); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
}

export function rectContains(r: Rect, p: Vec2): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function expandRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

/** Distance from a point to the nearest edge/interior of a rect (0 if inside). */
export function pointRectDistance(p: Vec2, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/**
 * Segment vs axis-aligned rect (Liang–Barsky). Returns the parametric t of
 * the entry point in [0,1], or -1 if the segment misses the rect.
 */
export function segmentRect(ax: number, ay: number, bx: number, by: number, r: Rect): number {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - r.x, r.x + r.w - ax, ay - r.y, r.y + r.h - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return -1;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return -1;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return -1;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0;
}

/**
 * Segment vs circle. Returns the parametric t of the first intersection in
 * [0,1], or -1 if none. Starting inside the circle returns 0.
 */
export function segmentCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return fx * fx + fy * fy <= r * r ? 0 : -1;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t = (-b - s) / (2 * a);
  if (t >= 0 && t <= 1) return t;
  return -1;
}

/**
 * Move a circle against a list of rects, axis-separated so it slides along
 * edges. Returns the resolved centre.
 */
export function moveCircle(pos: Vec2, radius: number, dx: number, dy: number, solids: readonly Rect[], bounds: Rect): Vec2 {
  // Sub-step so a fast mover never tunnels through cover thinner than its stride.
  const stride = Math.max(Math.abs(dx), Math.abs(dy));
  if (stride > radius) {
    const n = Math.ceil(stride / radius);
    let p = pos;
    for (let i = 0; i < n; i++) p = moveCircle(p, radius, dx / n, dy / n, solids, bounds);
    return p;
  }
  let x = pos.x + dx;
  let y = pos.y;
  for (const r of solids) {
    if (!circleRectOverlap(x, y, radius, r)) continue;
    x = dx > 0 ? r.x - radius : r.x + r.w + radius;
  }
  x = clamp(x, bounds.x + radius, bounds.x + bounds.w - radius);
  y = pos.y + dy;
  for (const r of solids) {
    if (!circleRectOverlap(x, y, radius, r)) continue;
    y = dy > 0 ? r.y - radius : r.y + r.h + radius;
  }
  y = clamp(y, bounds.y + radius, bounds.y + bounds.h - radius);
  return { x, y };
}

export function circleRectOverlap(cx: number, cy: number, r: number, rect: Rect): boolean {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
