# DECISIONS.md

Every design or technical choice, with the reason. Newest at the bottom. Dates are 2026.

---

## D-001 · Engine: TypeScript + Vite + Canvas 2D (no Phaser, no Godot) — 10-18

**Choice.** Web build. TypeScript, Vite for dev/build, raw Canvas 2D for rendering, Vitest for unit tests. No game framework.

**Why not Godot 4.** It is the better long-term engine for a Daggerfall-scale 2D world (tilemaps, navigation, scene tree, editor). But it is not installed on this machine, and the builder (Claude Code) cannot see the editor or play the game. Every "run it and tell me how it feels" step in the PRD would be blind. A browser game can be driven and screenshotted with Playwright, and its `update(dt)` can be stepped deterministically in tests.

**Why not Unity.** Same visibility problem, plus heavier toolchain and licensing noise for a prototype.

**Why not Phaser.** Phaser gives camera shake, particles, tilemaps and arcade physics for free, but its game loop is hard to step manually and its physics is AABB-only. The sandbox needs segment-vs-rect raycasts for line of sight, circle-vs-rect movement, and a loop that unit tests can tick. Writing those is ~300 lines and we own every number. Zero framework also means zero version churn.

**Risk accepted.** Milestone 1+ needs tile streaming, pathfinding at scale, and save/load. We will hand-build those. The arena already uses a tile grid with A* so the pattern is set early.

**Reversibility.** All stats live in JSON and all systems talk through an event bus. Porting to Godot later means porting systems one at a time, not untangling them.

## D-002 · Scale: 32 px tiles, 48 px characters, 960×540 internal canvas — 10-18

The PRD targets 48×48 character sprites and 16/32 px tiles. World units are pixels; one tile is 32 px. The game renders to a 960×540 internal canvas (16:9) and scales up to the window with `image-rendering: pixelated` at the largest integer multiple that fits. A 48 px character is about 1/11 of screen height, which reads well for three-quarter top-down. Arena is 40×30 tiles = 1280×960 px, so the camera must scroll; that exercises the camera now instead of at Milestone 1.

## D-003 · Evasive move: dodge roll with a short invulnerability window — 10-18

Dodge roll over crouch. Crouch only matters once there is a lot of chest-high cover and a stance system; roll is useful on turn one. The roll is a fixed-duration dash that costs stamina, cannot fire, and ignores projectiles for the first part of the roll (window length in `player.json`). Without the window the roll is just "move faster for a moment" and never feels like a decision. With it, timing a roll through a burst is the skill move the lethality demands.

## D-004 · Cursed Shot applies Burn — 10-18

Burn over slow or fear. Burn is the most legible: a visible ember trail on the enemy, ticking damage numbers, and it stacks with the low time-to-kill design without changing AI behaviour. Fear is the more interesting option (forces an enemy out of cover) and is the first candidate when magic expands in Milestone 3, because the cover system makes "flush them out" a real tactic.

## D-005 · Rifle fires a fast projectile, not hitscan — 10-18

One projectile path for every gun means cover, over-cover and team checks are written once. The rifle round moves fast enough (see `weapons.json`) that it is effectively instant inside the arena, and the tracer gives feedback hitscan would need faked.

## D-006 · Four cover types — 10-18

| type | blocks movement | blocks shots | blocks sight |
|---|---|---|---|
| wall | yes | yes | yes |
| crate | yes | yes | yes |
| fence | yes | no | no |
| low (sandbags, chest-high) | yes | yes | no |

Fence exists to shape movement paths (flanking routes) without stopping fire. "Low" is the PRD's chest-high object.

**Shooting over your own cover.** A projectile ignores a `low` cover object if it was fired from within `overCoverDistance` px of that object. So anyone pressed against sandbags fires over them, and incoming rounds still hit the sandbags. Symmetrical for player and enemy, and it is why enemies can use sandbags at all.

## D-007 · Enemies hear gunfire — 10-18

Not in the PRD. Added because without it a patrol walks past a firefight. A gunshot alerts every enemy within `hearingRange` of the shooter and gives them the shooter's position as last-known. Cheap, and it makes the first shot matter.

## D-008 · Flanking emerges from cover-spot scoring, plus an advance timer — 10-18

Each enemy scores candidate cover spots. A spot is penalised when its bearing from the player is within a threshold of another enemy's spot, so a group spreads around the player instead of stacking. An enemy that has held a spot for `advanceAfter` seconds without landing a hit picks a closer spot. An enemy whose cover no longer sits between it and the player ("flanked") re-picks immediately. No explicit squad AI; it stays decoupled and the behaviour reads as flanking.

## D-009 · HUD and debug panel are DOM, world is canvas — 10-18

Crisp text, sliders and checkboxes for free. The debug panel is generated from a schema that names a path into the live tuning store (`weapons.pistol.damage`), so adding a tunable is one line of data. Systems read the store at use-time, never cache stats, which is what makes runtime changes apply without restart.

## D-010 · Audio: hook layer with silent placeholder files — 10-18

`audio.play('fire_pistol')` resolves through `sounds.json` to a file under `public/audio/`. Placeholder files are generated silent WAVs. Swapping real audio is a file replacement.

## D-011 · Vision cone gates discovery only — 10-18

First probe showed an enemy peeking around a crate never fired: its cone followed its sidestep direction, so the player sat at 90° and was "unseen". Now the cone applies only in `patrol` and `search`. An alerted enemy needs range and line of sight, nothing else, and turns to face its last-known position whenever it loses sight. Reads as "they know you're there", which is true.

## D-012 · Click per shot, auto-reload on empty — 10-18

Every weapon fires on mouse *press*, never on hold. A six-shot cylinder clicked six times is the rhythm the Zero Sievert touchstone asks for; holding would turn the pistol into an SMG. When the last round leaves the clip, reload starts on its own (if reserve exists) so the player is never punished for not pressing R during a firefight; damage still interrupts it.

## D-013 · Dodge cancels a reload — 10-18

Rolling with a half-loaded cylinder loses the reload progress. It makes "roll now or finish loading" a real choice and keeps the roll from being free.

## D-014 · Enemies mildly prefer chest-high cover — 10-18

Spot scoring gives a small bonus to cover they can see over. Behind a wall they must peek, which gives the player a window; behind sandbags they fire continuously but can be flanked. Mixing both is what makes a group feel varied.
