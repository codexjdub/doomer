# Doomer

A fast, bloody, one-page shooter that runs in the browser, in the style of 1993: first-person, chunky pixel art at 320×200, drawn by a software renderer one column at a time. No libraries, no build step and no asset files: every texture, sprite, model and sound is generated in code.

## Play locally

The game uses ES modules, so it has to be served over HTTP rather than opened as a file:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move |
| Mouse | Look |
| Left click | Shoot |
| Space | Jump |
| 1 2 3 / mouse wheel / Q | Switch weapon |
| Tab (hold) | Map |
| Esc | Pause |

## Code map

| File | What it does |
| --- | --- |
| `index.html`, `style.css` | Page, messages and menus |
| `src/main.js` | Game setup, main loop, combat and effects glue |
| `src/renderer.js` | Software renderer: walls, floors, ceilings, sky and doors column by column, baked light maps, sprites and particles |
| `src/levels.js` | The five levels: layouts drawn as rectangles on a grid, plus each level's theme |
| `src/level.js` | Cell presets, collision, line of sight, pathfinding, doors |
| `src/textures.js` | Procedural textures shrunk to pixel art, and the sky |
| `src/monsters.js` | Sculpted monster models (distance fields meshed with surface nets) |
| `src/sprites.js` | Bakes the monster models into pixel-art sprites from five angles for every animation frame |
| `src/guns.js` | First-person gun models baked into pixel-art sprites |
| `src/art.js` | Hand-drawn pixel art: pickups, lamps, torches, the exit pad, fire, explosions and gibs |
| `src/statusbar.js` | The status bar: ammo, health, weapons, armor and keys |
| `src/player.js` | Player movement, health and camera |
| `src/weapons.js` | Firing, switching and the gun on screen |
| `src/enemies.js` | Monster AI, animation frames and fireballs |
| `src/items.js` | Pickups, lamps, torches and the exit pad |
| `src/effects.js` | Particles, gibs, explosions and the moving lights |
| `src/audio.js` | Synthesized sound effects and ambience |
| `src/music.js` | Adaptive soundtrack: explore, combat and boss layers synthesized live |
| `src/automap.js` | Explored-area tracking, corner minimap and full-screen map |
| `src/hud.js`, `src/input.js` | HUD, menus, settings, keyboard and mouse |
| `src/vec.js` | A small 3D vector |

## Editing levels

Levels live in `src/levels.js`. Each one is laid out as filled rectangles on a grid of 1 m cells, and has a name, a hint, a theme (fog, ambient light, lamp colour), optional extra lights and its own cell presets. The shared character legend is in `src/level.js` (`PRESETS` for cells, `ENTITY_CHARS` for monsters, pickups and lights). Each entity stands on the floor of a neighbouring cell.
