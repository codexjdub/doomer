# Doomer

A fast, bloody, one-page 3D shooter that runs in the browser. Built with [Three.js](https://threejs.org/), with no build step and no asset files: every texture, model and sound is generated in code.

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
| `index.html`, `style.css` | Page, HUD and menus |
| `src/main.js` | Game setup, main loop, combat and effects glue |
| `src/levels.js` | The five levels: layouts drawn as rectangles on a grid, plus each level's theme |
| `src/level.js` | Cell presets, level geometry, collision, line of sight, pathfinding, doors |
| `src/textures.js` | Procedural textures, normal maps, materials and the sky |
| `src/player.js` | Player movement, health and camera |
| `src/weapons.js` | Weapon models, firing, recoil and view-model animation |
| `src/enemies.js` | Monster AI, animation and fireballs |
| `src/monsters.js` | Sculpted monster models (distance fields meshed with surface nets) |
| `src/items.js` | Pickups, lamps, torches and the exit pad |
| `src/effects.js` | Particles, decals, gibs and the dynamic light pool |
| `src/audio.js` | Synthesized sound effects and ambience |
| `src/music.js` | Adaptive soundtrack: explore, combat and boss layers synthesized live |
| `src/automap.js` | Explored-area tracking, corner minimap and full-screen map |
| `src/hud.js`, `src/input.js` | HUD, menus, settings, keyboard and mouse |

## Editing levels

Levels live in `src/levels.js`. Each one is laid out as filled rectangles on a grid of 1 m cells, and has a name, a hint, a theme (fog, ambient light, lamp colour), optional extra lights and its own cell presets. The shared character legend is in `src/level.js` (`PRESETS` for cells, `ENTITY_CHARS` for monsters, pickups and lights). Each entity stands on the floor of a neighbouring cell.
