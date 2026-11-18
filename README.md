# Palmara Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Calistaa113/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Calistaa113/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A 2D top-down open-world crime game for the [gta6-01 bounty](https://make.fun/bounty/gta6-01).
You are Rio, a wheelman new to Palmara — a sun-soaked coastal city of downtown
towers, quiet suburbs, warehouses, a big park and a beach with a pier. Fixer Lena
Cruz pays cash for six missions; the Palmara PD pays attention.

## The city

Five districts on a 3600×2600 map: downtown, residential, industrial, the park
and the beach. Traffic follows the roads, pedestrians walk the sidewalks and flee
from gunfire, and the sea rolls on the east edge. Everything is drawn in layered
canvas detail — cars with cabins, headlights and shadows, buildings with window
grids, road markings, crosswalks, palms and dust, sparks and skid marks.

## How to play

- **WASD / arrow keys** — walk and drive
- **Shift** — run
- **E** — steal a car / get out / use a shop
- **F** — punch
- **Click** — shoot (aim with the mouse)
- **R** — reload
- **P / Esc** — pause
- **M** — mute

## The loop

Steal a car, run Lena's missions, earn cash, stay ahead of the wanted level.
Spray shops clear the heat for $150, the arms dealer sells ammo, the hospital
patches you up. Get busted and you pay a $100 fine; get knocked out and the
hospital takes 10%. Finish all six missions to become King of Palmara.

## Files

- `game/index.html` — the page; everything else is an ES module under `game/src/`
- `game/src/main.js` — boot and the one loop, screens, saving
- `game/src/city.js` — the seeded city: districts, buildings, trees, shops
- `game/src/world.js` — the simulation: cars, traffic, police, missions, wanted
- `game/src/render.js` — everything drawn: the city, the cars, the HUD, the minimap
- `game/src/input.js` — keyboard and mouse, read as the world wants them
- `game/src/audio.js` — all sound synthesised with Web Audio, no audio files
- `game/src/shots.js` — the `?shot=` scenes the screenshots are taken from
- `game/src/config.js` — every tuning number and colour in one place
- `game/src/random.js` — the seeded generator behind `?seed=`
- `main.ts` — copies `game/` and `screenshots/` to `/output` and writes `dossier.json`

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network at runtime: every file the game loads lives under
`game/`. Screenshots are real renders of the game in a browser
(`?shot=start|play|chase|end&seed=1`).
