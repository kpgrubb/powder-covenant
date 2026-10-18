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

## D-015 · Feel notes from the first probes (numbers, not opinions) — 10-18

The builder cannot play. Every "feel" claim below is a measurement from driving `window.__game.step()` and the live loop under Playwright; the rest is for Kevin to judge.

| Thing | Measured | Read |
|---|---|---|
| Walk / sprint | 150 / 240 px/s (4.7 / 7.5 tiles/s); arena crossed in ~8.5 s walking | Deliberate, not sluggish. Sprint burns the bar in 3.5 s. |
| Dodge | 160 px in 0.38 s, 13 frames (0.22 s) invulnerable, 25 stamina | Four rolls empty the bar; the choice is real. |
| Saber | 5 swings in 2 s, 38 dmg each; a regular (60 hp) dies in 2 swings | Fast and committal; you must close 300 px of open ground to use it. |
| Pistol | 6 shots in 1.6 s on click spam, then 1.9 s reload; 24 dmg; 3 shots to kill | Rhythm is tap-tap-tap-tap-tap-tap-pause. Spread 5° means ~1 miss in 8 at 200 px. |
| Rifle | 90 dmg, one shot, 3.4 s reload; shots at 0.0 s and 3.4 s | Two seconds of nothing after every shot. Lethal to a regular in one hit, so the rhythm is "line it up, commit". |
| Cover | Wall and sandbags stop rounds both ways; fence does not; leaning on sandbags fires over them | Verified by event log, not eyeballed. |
| Enemy vs. stationary player | One regular at ~320 px: 31 shots in 15 s, player at 23 hp after 20 s (before the accuracy/damage bump) | Too slow. Accuracy 0.68→0.78 and carbine 11→13 dmg to put a single-enemy kill around 10 s and a two-enemy kill around 4 s. Re-measure after a human plays it. |
| Flanked enemy | Player moved to its exposed side: re-picked the opposite face of the same sandbags in <1 s | Works. |
| 20 enemies | 0.11 ms sim + 0.16 ms render per frame; live loop reports 60 fps | Perf is a non-issue for Milestone 0. |

**Flags for the human playtest**
- Enemies stacking two to a crate looks silly even with separation. Spot occupancy cost may need to go up.
- The rifle's 3.4 s reload may be too long without a dodge-cancel escape; watch for it feeling like a punishment rather than a decision.
- Grit has no feedback other than the bar. A cast should probably do something visible on the player beyond the ring.

## D-016 · Tiles are 48 px, set by the art pack — 10-18

The PRD asked for 16 or 32 px tiles under 48 px characters. Kevin's downloaded pack ("American Civil War", RPG Maker MV/MZ layout) is 48 px throughout, with soldiers drawn to the same cell. Resampling 48→32 would soften the pixel art, so the world grid moves to 48. Arena stays 40×30 tiles (now 1920×1440 px); the 960×540 camera shows 20×11 tiles. Characters are one tile tall, which is the pack's intended look.

**Sheets, as copied to `public/sprites/acw/`:** `a2_ground` (autotile blocks; the seamless interior of each 2×3 block is the 48×48 window at +24,+72), `a4_walls1/2` (not used yet), `b01_ruins` (crates, rubble, cannons), `b02_fortifications` (palisade, sandbags, fences, chevaux-de-frise, trenches, dead trees, graves, rifle stacks), `b03_camp` (tents, wagons, barrels, fires), `b04_confederate`, `b05_union` (static poses, several facings).

**Characters without animation.** The pack has poses, not walk cycles. `sprite4` picks one cell per facing (right, down, up; left is a horizontal flip of right) from the aim angle. The player keeps a thin aim line because the sprite only has four facings and the gun points anywhere. Walk animation is a later purchase or generation task; it does not block the Valley.

**Cover rects are the full cell.** A sandbag cell has empty pixels above the bags, so collision is slightly generous. Acceptable for now; tighten per visual if it reads wrong.

**License flag.** No license file came in the archive. The repo and the gh-pages site are public, so committing the sheets redistributes them. Kevin to confirm the pack's terms allow that, or the repo goes private.
