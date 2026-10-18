/**
 * Status effects carried by a combatant. Only Burn exists in Milestone 0.
 * Owning systems call `tick` each update and apply the returned damage
 * themselves, so this module never touches an entity.
 */
export interface BurnState {
  remaining: number;
  tickTimer: number;
  damagePerSecond: number;
  tickInterval: number;
}

export interface StatusState {
  burn: BurnState | null;
}

export const emptyStatus = (): StatusState => ({ burn: null });

export function applyBurn(s: StatusState, def: { damagePerSecond: number; duration: number; tickInterval: number }): void {
  // Re-applying refreshes duration and takes the stronger damage.
  const dps = Math.max(def.damagePerSecond, s.burn?.damagePerSecond ?? 0);
  s.burn = { remaining: def.duration, tickTimer: def.tickInterval, damagePerSecond: dps, tickInterval: def.tickInterval };
}

/** Advance timers; returns damage to apply this update (0 most frames). */
export function tickStatus(s: StatusState, dt: number): number {
  let dmg = 0;
  const b = s.burn;
  if (b) {
    b.remaining -= dt;
    b.tickTimer -= dt;
    if (b.tickTimer <= 0) {
      b.tickTimer += b.tickInterval;
      dmg += b.damagePerSecond * b.tickInterval;
    }
    if (b.remaining <= 0) s.burn = null;
  }
  return dmg;
}
