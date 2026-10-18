# Powder & Covenant — Milestone 0 combat sandbox

Top-down action RPG prototype. Alternate American Civil War, magic that runs on gunpowder. This milestone is one test arena to prove the combat loop. See `PRD.md` for scope and `DECISIONS.md` for every choice made and why.

## Run

```
npm install
npm run dev
```

Open http://localhost:5180. Click the canvas once so it has focus.

## Live build

https://kpgrubb.github.io/powder-covenant/

```
npm run deploy
```

Builds `dist/` and publishes it to the `gh-pages` branch. Source is on `master`.

## Test

```
npm test
```

Unit tests cover weapon math, line-of-sight raycasts, and the debug panel's apply logic.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Aim (independent of movement) |
| Left click | Fire / swing |
| Shift | Sprint (costs stamina) |
| Space | Dodge roll (costs stamina, brief invulnerability) |
| R | Reload (also starts on its own when the clip empties) |
| 1 / 2 / 3 | Saber / Pistol / Rifle |
| Q | Cursed Shot: next hit burns (costs Grit) |
| N | Spawn an enemy (debug) |
| F | Refill Grit (debug, stands in for returning to a hub) |
| ` (backtick) | Toggle debug tuning panel |
| Enter | Restart after death |

## Layout

```
src/
  core/      event bus, game loop, math, input, tuning store
  data/      all stats as JSON (weapons, enemies, player, spells, arena, visuals, sounds)
  world/     arena, colliders, cover spots, tile grid + A*
  entities/  player
  weapons/   weapon state machine, projectiles, melee
  enemies/   Confederate regular AI, spawner
  magic/     Cursed Shot
  fx/        particles, shake, damage numbers, audio hooks
  render/    camera and canvas renderer, sprite-swap visuals
  ui/        HUD and debug panel (DOM)
tests/       vitest
public/      silent placeholder audio, (future) sprites
```

## Editing stats

Everything numeric lives in `src/data/*.json`. Change a value, save, Vite hot-reloads. The debug panel (backtick) edits the same values live in-session; those edits are not written back to disk.

## Swapping art

Each entity names a visual in `src/data/visuals.json`. A visual is either a `shape` (placeholder) or a `sprite` (`src`, frame size). Replace the entry, drop the PNG in `public/sprites/`, no code change.
