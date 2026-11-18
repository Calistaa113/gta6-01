// Every tuning number and colour in one place. The playfield is a 1280x720 logical
// viewport over a 3600x2600 city; the renderer scales it to the window, so no rule
// below depends on the screen size.

export const WORLD = { width: 3600, height: 2600 };
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;

/** Vertical and horizontal road centre lines. The last vertical road is Ocean Drive. */
export const ROADS_X = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3200];
export const ROADS_Y = [200, 600, 1000, 1400, 1800, 2200];
export const ROAD_W = 64;
/** The sea starts here (east edge); sand runs from the last road to the water. */
export const SEA_X = 3440;

export const PLAYER = {
  radius: 14,
  walkSpeed: 170,
  runSpeed: 260,
  hp: 100,
  punchRange: 34,
  punchDamage: 25,
  punchCooldown: 0.45,
  shootCooldown: 0.22,
  magSize: 12,
  startAmmo: 12,
  startReserve: 48,
};

export const CARS = {
  sedan: { length: 64, width: 30, topSpeed: 360, accel: 260, brake: 520, grip: 3.4, hp: 160, body: '#3e6fb5', glass: '#1c2f45', name: 'Sedan' },
  taxi: { length: 64, width: 30, topSpeed: 350, accel: 250, brake: 520, grip: 3.4, hp: 160, body: '#f2b705', glass: '#1c2f45', name: 'Taxi' },
  sports: { length: 68, width: 30, topSpeed: 460, accel: 380, brake: 620, grip: 4.4, hp: 140, body: '#d7263d', glass: '#141c26', name: 'Sports' },
  truck: { length: 92, width: 34, topSpeed: 290, accel: 190, brake: 420, grip: 2.8, hp: 220, body: '#7a6a53', glass: '#1c2f45', name: 'Truck' },
  police: { length: 66, width: 30, topSpeed: 400, accel: 330, brake: 600, grip: 4.0, hp: 160, body: '#20242c', glass: '#10151d', name: 'Police' },
};

export const TRAFFIC_SPEED = 150;
export const POLICE_RAM_RANGE = 260;
export const WANTED_DECAY_SECONDS = 20;
export const ARREST_SECONDS = 2;

/** Sun-soaked coastal palette: warm sand, teal sea, terracotta roofs, green parks. */
export const PALETTE = {
  backdrop: '#0e1a24',
  sand: '#e8d5a4',
  sandDark: '#dcc78f',
  sea: '#2fa8a0',
  seaDeep: '#1f7f8c',
  grass: '#7fb069',
  grassDark: '#6a9a58',
  parkPath: '#d9c9a3',
  road: '#3a3f47',
  roadEdge: '#565d68',
  sidewalk: '#b9b3a4',
  curb: '#8f887a',
  centreDash: '#f2d06b',
  crosswalk: '#e8e6df',
  downtownGround: '#c9bda6',
  residentialGround: '#b7c48a',
  industrialGround: '#a8a49a',
  buildingOutline: '#00000033',
  text: '#f5f1e6',
  muted: '#c9c2ae',
  panel: '#141a20e6',
  panelEdge: '#f2d06b',
  money: '#ffd94d',
  health: '#58d68d',
  healthLow: '#e5534b',
  star: '#ffd94d',
  starEmpty: '#5a5344',
  waypoint: '#ff9f1c',
  prompt: '#ffffff',
  banner: '#ff9f1c',
  minimapBg: '#1d2b33',
};

/** Roof colours per district, picked by seeded roll. */
export const ROOFS = {
  downtown: ['#c96f4a', '#b5533c', '#8f6fb5', '#4a7fa5', '#5a8a6a', '#a5546b'],
  residential: ['#c96f4a', '#d98e4a', '#a5546b', '#7a9a5a', '#b5533c', '#8a6fb5'],
  industrial: ['#7a7f85', '#6a7076', '#8a7a5a', '#5a6a72'],
  beach: ['#e8e0cc', '#d9c9a3', '#c96f4a'],
};
export const WALLS = {
  downtown: ['#e8dcc8', '#d9c9b8', '#c8b8a8', '#e0cbb0'],
  residential: ['#f0e6d2', '#e8d5b8', '#d9c9a3', '#e0cbb0'],
  industrial: ['#b8b0a0', '#a8a49a', '#c0b8a8'],
  beach: ['#f5efe0', '#e8e0cc'],
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const BEST_KEY = 'palmara-heat.best';
export const SAVE_KEY = 'palmara-heat.save';
