// The city of Palmara: a road grid, five districts, buildings with roofs and window
// grids, trees and palms, the beach and the sea, and the places missions need. All of
// it is generated from the seeded generator, so the same seed builds the same city.
//
// Districts (by block column/row):
//   downtown    — centre blocks, tall towers, dense
//   residential — west blocks, houses with gardens and trees
//   industrial  — north-east blocks, warehouses and containers
//   park        — centre-south, one big green with a pond
//   beach       — the east strip: sand, palms, the pier and the sea
import { ROADS_X, ROADS_Y, ROAD_W, ROOFS, SEA_X, WALLS, WORLD } from './config.js';
import { randInt, randPick } from './random.js';

const PARK = { colMin: 2, colMax: 4, rowMin: 3, rowMax: 4 };

function districtOf(col, row) {
  if (col >= PARK.colMin && col <= PARK.colMax && row >= PARK.rowMin && row <= PARK.rowMax) return 'park';
  if (col >= 6 && row <= 1) return 'industrial';
  if (col >= 2 && col <= 4 && row >= 1 && row <= 2) return 'downtown';
  return 'residential';
}

/** Block bounds for the block between roads col and col+1, row and row+1. */
function blockBounds(col, row) {
  const x0 = ROADS_X[col] + ROAD_W / 2 + 14;
  const x1 = ROADS_X[col + 1] - ROAD_W / 2 - 14;
  const y0 = ROADS_Y[row] + ROAD_W / 2 + 14;
  const y1 = ROADS_Y[row + 1] - ROAD_W / 2 - 14;
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

function makeBuilding(random, x, y, w, h, district, type) {
  const roof = randPick(random, ROOFS[district] || ROOFS.residential);
  const wall = randPick(random, WALLS[district] || WALLS.residential);
  const winCols = Math.max(2, Math.floor(w / 46));
  const winRows = Math.max(2, Math.floor(h / 46));
  // A per-building lit-window pattern, derived from one seeded roll.
  let lit = 0;
  for (let i = 0; i < winCols * winRows; i += 1) if (random() < 0.35) lit |= 1 << (i % 31);
  return { x, y, w, h, roof, wall, winCols, winRows, lit, type, district, shadow: type === 'tower' ? 14 : 8 };
}

function makeTree(random, x, y, kind) {
  return { x, y, r: kind === 'palm' ? 15 : 13 + random() * 8, kind, lean: (random() - 0.5) * 0.3 };
}

export function createCity(random) {
  const buildings = [];
  const trees = [];
  const blocks = [];
  const cols = ROADS_X.length - 1;
  const rows = ROADS_Y.length - 1;

  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const district = districtOf(col, row);
      const b = blockBounds(col, row);
      blocks.push({ ...b, district });
      if (district === 'park') {
        // The park: lawn, a pond, winding paths and clusters of trees.
        const pond = { x: b.x0 + b.w * 0.32, y: b.y0 + b.h * 0.3, w: b.w * 0.36, h: b.h * 0.4 };
        blocks[blocks.length - 1].pond = pond;
        for (let i = 0; i < 16; i += 1) {
          const x = b.x0 + 30 + random() * (b.w - 60);
          const y = b.y0 + 30 + random() * (b.h - 60);
          if (x > pond.x - 20 && x < pond.x + pond.w + 20 && y > pond.y - 20 && y < pond.y + pond.h + 20) continue;
          trees.push(makeTree(random, x, y, 'tree'));
        }
        continue;
      }
      if (district === 'downtown') {
        // One or two towers per block, tall and close to the street.
        const n = random() < 0.6 ? 1 : 2;
        for (let i = 0; i < n; i += 1) {
          const w = b.w * (n === 1 ? 0.62 : 0.42);
          const h = b.h * (n === 1 ? 0.66 : 0.44);
          const x = b.x0 + (b.w - w) / 2 + (n === 2 ? (i === 0 ? -b.w * 0.22 : b.w * 0.22) : 0);
          const y = b.y0 + (b.h - h) / 2 + (random() - 0.5) * 20;
          buildings.push(makeBuilding(random, x, y, w, h, district, 'tower'));
        }
        for (let i = 0; i < 3; i += 1) trees.push(makeTree(random, b.x0 + 24 + random() * (b.w - 48), b.y0 + 24 + random() * (b.h - 48), 'tree'));
      } else if (district === 'industrial') {
        const w = b.w * (0.5 + random() * 0.2);
        const h = b.h * (0.4 + random() * 0.2);
        buildings.push(makeBuilding(random, b.x0 + (b.w - w) / 2, b.y0 + (b.h - h) / 2, w, h, district, 'warehouse'));
        // Container stacks at the block corners.
        for (let i = 0; i < 3; i += 1) {
          buildings.push(makeBuilding(random, b.x0 + 12 + random() * (b.w - 90), b.y0 + b.h - 52, 64, 26, district, 'container'));
        }
      } else {
        // Residential: two or three houses with gardens.
        const n = 2 + (random() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i += 1) {
          const w = 84 + random() * 40;
          const h = 74 + random() * 36;
          const x = b.x0 + 26 + (i % 2) * (b.w / 2 - 20) + random() * 20;
          const y = b.y0 + 26 + Math.floor(i / 2) * (b.h / 2 - 10) + random() * 16;
          buildings.push(makeBuilding(random, Math.min(x, b.x1 - w - 8), Math.min(y, b.y1 - h - 8), w, h, district, 'house'));
        }
        for (let i = 0; i < 5; i += 1) trees.push(makeTree(random, b.x0 + 24 + random() * (b.w - 48), b.y0 + 24 + random() * (b.h - 48), 'tree'));
      }
    }
  }

  // Beach strip: palms along the sand, the pier reaching into the sea.
  for (let y = 120; y < WORLD.height - 100; y += 130) {
    trees.push(makeTree(random, 3260 + random() * 120, y + random() * 60, 'palm'));
  }
  const pier = { x: 3380, y: 1080, w: 150, h: 26 };

  // Places the missions and shops need, all beside a road.
  const shops = {
    spray: { kind: 'spray', name: 'Spray Shop', x: 1432, y: 1032, price: 150 },
    arms: { kind: 'arms', name: 'Arms Dealer', x: 2632, y: 232, price: 60 },
    hospital: { kind: 'hospital', name: 'Hospital', x: 632, y: 1432, price: 120 },
  };
  const places = {
    safehouse: { x: 632, y: 1832, name: 'Safehouse' },
    lena: { x: 1832, y: 632, name: "Lena's Office" },
    pierEnd: { x: 3500, y: 1093, name: 'Pier' },
    meet: { x: 2632, y: 632, name: 'Meet Point' },
    garage: { x: 1432, y: 632, name: 'Penthouse Garage' },
    marina: { x: 3260, y: 420, name: 'Marina' },
  };

  return { buildings, trees, blocks, shops, places, pier, cols, rows, spawn: { x: 640, y: 1030 } };
}

/** The nearest road intersection to a point. */
export function nearestIntersection(x, y) {
  let bestX = ROADS_X[0];
  let bestY = ROADS_Y[0];
  let best = Infinity;
  for (const rx of ROADS_X) {
    for (const ry of ROADS_Y) {
      const d = (rx - x) * (rx - x) + (ry - y) * (ry - y);
      if (d < best) { best = d; bestX = rx; bestY = ry; }
    }
  }
  return { x: bestX, y: bestY, col: ROADS_X.indexOf(bestX), row: ROADS_Y.indexOf(bestY) };
}

/**
 * A shortest route over the road grid, as a list of intersection points from the
 * intersection nearest `from` to the one nearest `to` (breadth-first search).
 */
export function findPath(from, to) {
  const start = nearestIntersection(from.x, from.y);
  const goal = nearestIntersection(to.x, to.y);
  const key = (c, r) => `${c},${r}`;
  const prev = new Map([[key(start.col, start.row), null]]);
  const queue = [[start.col, start.row]];
  while (queue.length > 0) {
    const [c, r] = queue.shift();
    if (c === goal.col && r === goal.row) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= ROADS_X.length || nr >= ROADS_Y.length) continue;
      if (prev.has(key(nc, nr))) continue;
      prev.set(key(nc, nr), [c, r]);
      queue.push([nc, nr]);
    }
  }
  const points = [];
  let cur = [goal.col, goal.row];
  while (cur) {
    points.unshift({ x: ROADS_X[cur[0]], y: ROADS_Y[cur[1]] });
    cur = prev.get(key(cur[0], cur[1]));
  }
  return points;
}

/** The nearest point on any road centre line to (x, y). */
export function nearestRoadPoint(x, y) {
  let best = { x: ROADS_X[0], y, d: Infinity };
  for (const rx of ROADS_X) {
    const d = Math.abs(rx - x);
    if (d < best.d) best = { x: rx, y: Math.max(0, Math.min(WORLD.height, y)), d };
  }
  for (const ry of ROADS_Y) {
    const d = Math.abs(ry - y);
    if (d < best.d) best = { x: Math.max(0, Math.min(WORLD.width, x)), y: ry, d };
  }
  return best;
}

/** True when the point is on a road (within the asphalt plus a small margin). */
export function onRoad(x, y, margin = 0) {
  for (const rx of ROADS_X) if (Math.abs(x - rx) <= ROAD_W / 2 + margin) return true;
  for (const ry of ROADS_Y) if (Math.abs(y - ry) <= ROAD_W / 2 + margin) return true;
  return false;
}

/** True when the point is on sand or in the sea (east strip). */
export function onBeach(x) {
  return x > ROADS_X[ROADS_X.length - 1] + ROAD_W / 2;
}

/**
 * Push a circle out of every building it overlaps. Returns true when it touched
 * one. Buildings are solid; trees and the pier are not.
 */
export function collideBuildings(city, body) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= body.r * body.r) continue;
    hit = true;
    if (d2 < 0.0001) {
      body.x = b.x + b.w + body.r;
      continue;
    }
    const d = Math.sqrt(d2);
    body.x = cx + (dx / d) * body.r;
    body.y = cy + (dy / d) * body.r;
  }
  return hit;
}

/** A random point on a road, at least `minDist` from (x, y). */
export function randomRoadPoint(random, x, y, minDist) {
  for (let tries = 0; tries < 40; tries += 1) {
    const vertical = random() < 0.5;
    const px = vertical ? randPick(random, ROADS_X) : 120 + random() * (WORLD.width - 360);
    const py = vertical ? 120 + random() * (WORLD.height - 240) : randPick(random, ROADS_Y);
    const dx = px - x;
    const dy = py - y;
    if (dx * dx + dy * dy >= minDist * minDist) return { x: px, y: py };
  }
  return { x: 600, y: 600 };
}
