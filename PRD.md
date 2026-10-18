# PRD — Powder & Covenant (working title)

**Status:** Draft v0.1 · **Owner:** Kevin · **Builder:** Claude Code
**Scope of this PRD:** Milestone 0, the combat sandbox. Later milestones are sketched for context only and must not be built yet.

---

## 1. Summary

A top-down, open-world action RPG set in an alternate American Civil War where magic is real and runs on gunpowder, blood, and bargain. The player is a field agent of a secret Union order that keeps occult artifacts out of Confederate hands. The war advances on its own clock; the player moves through it.

**Touchstones**
- *Zero Sievert* — combat feel: line of sight, cover, lethality, scarce ammo, slow reloads
- *Daggerfall* — scale, continuous travel, a map larger than you will finish
- *Caves of Qud* — hand-authored world with living systems; nothing procedural

**Tone:** Gothic American horror. Revival tents, haunted bayous, burned plantations, river towns, battlefield dead that do not stay down.

## 2. Goals and non-goals

**Goals (whole project)**
- Combat that feels dangerous and deliberate from the first minute
- A persistent, hand-built world where faction control shifts without the player
- Permanent character progression with a real cost to death
- A distinct magic system tied to gunpowder and the macabre

**Non-goals (whole project)**
- Procedural level generation
- Roguelike run structure or meta-progression resets
- Multiplayer
- Mobile

## 3. Milestones

| # | Name | Outcome | Status |
|---|------|---------|--------|
| 0 | Combat sandbox | One test arena. Movement, three weapons, one spell, one enemy, upgrade debug panel. Feel is tuned. | **This PRD** |
| 1 | The Valley | First hand-built region with 3–4 distinct places, one hub, death penalty, basic loot | Not started |
| 2 | The War | Faction territory control on a clock, dynamic field battles, second faction | Not started |
| 3 | The Order | Artifact quests, progression tree, magic expansion, rival occult order | Not started |
| 4+ | Expansion | Adjacent regions (swamp, urban, battlefield, river, rail, mine, fort, graveyard), additional enemy factions | Not started |

## 4. Milestone 0 — Combat sandbox

### 4.1 Objective
Prove the combat loop is fun before any world exists. Success means: a tester can play the arena for ten minutes and want to keep going.

### 4.2 Functional requirements

**R1 Arena**
- Flat test field, roughly 40×30 tiles.
- Cover objects: walls, crates, a fence line, at least one chest-high object that blocks shots but not sight.
- Cover must block enemy and player projectiles.

**R2 Player controller**
- WASD movement, mouse aim, independent of facing.
- Sprint with a stamina cost.
- One evasive move: dodge roll or crouch. Builder picks; log the choice.
- Health, stamina, and a magic resource (working name: *Grit*). All visible on HUD.

**R3 Weapon system**
- Shared weapon interface. Every weapon declares: damage, range, fire rate, clip size, reload time, spread, projectile speed or melee arc.
- Weapon stats live in data files, not code.
- Three weapons in the first build:
  - **Saber** — melee arc, no ammo, fast, short range, can deflect nothing (for now)
  - **Pistol** — fast, short range, 6-shot cylinder, moderate reload
  - **Rifle** — slow, long range, single shot, long reload, high damage, hitscan or fast projectile
- Hotbar with number keys to switch. Switching has a short delay.
- Reload interrupts on damage taken.
- Ammo is finite and tracked per weapon type.

**R4 Magic**
- One spell in the first build: **Cursed Shot** — the next shot fired applies a status effect (burn, slow, or fear; builder picks one). Costs Grit.
- Grit does not regenerate in the field. A debug key refills it (stands in for returning to a hub).

**R5 Enemy — Confederate regular**
- Patrols between waypoints.
- Detects the player by line of sight within a cone and range.
- On detection: moves to nearest cover, fires in bursts, repositions when flanked.
- Has health, takes damage from all player sources, dies, drops ammo.
- Enemy stats in data files.
- Spawner in the arena to add enemies on a keypress for testing.

**R6 Feedback**
- Muzzle flash, hit flash on enemies, blood or spark particles, screen shake scaled to weapon.
- Placeholder sound hooks for fire, reload, hit, death. Silent files are fine; the hooks must exist.
- Damage numbers toggleable from the debug panel.

**R7 Debug upgrade panel**
- In-game panel (toggle with a key) exposing: weapon damage, reload speed, clip size, spread, player speed, player health, spell cost, enemy health, enemy accuracy.
- Changes apply at runtime without restart. This is how feel gets tuned.

**R8 Art**
- Placeholder shapes only: colored rectangles and circles with a facing indicator.
- A sprite-swap system so that art can replace placeholders later without code changes. Each entity reads its visual from a data reference.
- Target sprite grid for later: 48×48 characters, 16×16 or 32×32 tiles. Build the camera and scale for that now.

### 4.3 Acceptance criteria
- [ ] Player can move, sprint, dodge, aim, and switch between three weapons
- [ ] Each weapon feels distinct; a blindfolded tester could tell them apart by rhythm
- [ ] Cover stops projectiles in both directions
- [ ] Enemy seeks cover and flanks; standing still gets the player killed
- [ ] Cursed Shot works and costs Grit
- [ ] Every number in the debug panel changes behavior live
- [ ] Weapon and enemy stats can be edited in data files without touching code
- [ ] `DECISIONS.md` logs every design or tech choice and the reason
- [ ] Game runs at 60fps with 20 enemies on screen

### 4.4 Out of scope for Milestone 0
Open world, hubs, death penalty, war simulation, dialogue, inventory beyond the hotbar, saving, real art, real audio, menus beyond debug.

## 5. Technical constraints

- **Engine:** Claude Code's choice. Suggested: Godot 4 with GDScript, 2D. Alternatives: Unity (C#) or a web build (TypeScript + Phaser). State the choice and rationale in `DECISIONS.md` before writing code.
- **Architecture:** systems decoupled. Player, weapon, enemy, spell, and upgrade systems do not reach into each other's internals. Communicate through signals or events.
- **Data-driven:** stats in JSON, TRES, or equivalent. No magic numbers in scripts.
- **Repo hygiene:** small commits, clear messages, a README with run instructions, a `DECISIONS.md`, and this PRD at the root.
- **Testing:** where the engine allows it, unit tests for weapon math and the upgrade panel's apply logic.

## 6. Future context (do not build yet)

These exist so that Milestone 0 decisions do not paint us into a corner.

- **Death:** respawn at last hub, lose everything gained since. Hubs bank progress.
- **Progression:** permanent. Weapons, spells, artifacts, order standing.
- **War clock:** factions hold territory; control shifts on its own; dynamic battles in the field.
- **Factions and enemies:** Confederate regulars, Confederate occultists (the mirror order), demons and bound dead, damned sailors and river pirates, a British expeditionary contingent, deserters, bandits, swamp things.
- **Weapon classes to come:** shotgun, carbine, revolver, thrown powder charges, artifact weapons.
- **Magic classes to come:** cursed shot, powder sigils, binding, wards.
- **Art direction:** pixel art, 48×48 characters, fixed 32-color palette, three-quarter top-down. AI-assisted generation with Aseprite cleanup.

## 7. Day One instructions for Claude Code

1. Read this PRD in full. Ask no more than three clarifying questions, then proceed.
2. Choose the engine. Write the rationale in `DECISIONS.md`.
3. Set up the repo with README, folder structure, and this PRD.
4. Build in this order: arena → player controller → weapon system with saber → pistol → rifle → feedback → enemy → spell → debug panel.
5. After each system, run the game and describe in plain words what it feels like. Flag anything that feels wrong.
6. Stop when the acceptance criteria are met or after the debug panel, whichever is first, and report.
