// The simulation of Palmara: the player on foot and in cars, traffic, pedestrians,
// police, the wanted level, shops, pickups, particles and a six-mission story. No
// drawing and no browser in here: step() advances one fixed step and returns what
// happened as bit flags, so the caller can react without the world knowing about
// screens or sound. All randomness comes from the seeded generator, so the same
// seed plays the same game.
import {
  CARS, PLAYER, POLICE_RAM_RANGE, ROADS_X, ROADS_Y, ROAD_W, SEA_X,
  TRAFFIC_SPEED, WANTED_DECAY_SECONDS, ARREST_SECONDS, WORLD,
} from './config.js';
import {
  collideBuildings, findPath, nearestIntersection, nearestRoadPoint,
  onBeach, onRoad, randomRoadPoint,
} from './city.js';
import { randInt, randPick } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_SHOT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_MISSION = 4;
export const EVENT_WANTED = 8;
export const EVENT_BUSTED = 16;
export const EVENT_DOWN = 32;
export const EVENT_CRASH = 64;
export const EVENT_WIN = 128;

const TAU = Math.PI * 2;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** The six-mission story chain from fixer Lena Cruz. */
export const MISSIONS = [
  {
    name: 'First Wheels',
    steps: [
      { kind: 'steal', text: 'Steal a car — walk up to one and press E' },
      { kind: 'goto', text: 'Drive to the Spray Shop', target: 'spray' },
    ],
    reward: 100,
  },
  {
    name: 'Cash Run',
    steps: [
      { kind: 'collect', text: 'Collect the cash bags', bags: [[1400, 1000], [1800, 1400], [1000, 600]] },
      { kind: 'goto', text: 'Bring the cash to the safehouse', target: 'safehouse' },
    ],
    reward: 200,
  },
  {
    name: 'Courier',
    steps: [
      { kind: 'goto', text: 'Pick up the package at Lena’s office', target: 'lena' },
      { kind: 'deliver', text: 'Deliver the package to the Pier', target: 'pierEnd', timer: 120 },
    ],
    reward: 250,
  },
  {
    name: 'Heat Wave',
    steps: [
      { kind: 'survive', text: 'Survive the heat', timer: 60, wanted: 3 },
    ],
    reward: 300,
  },
  {
    name: 'The Drop',
    steps: [
      { kind: 'goto', text: 'Drive to the meet point', target: 'meet' },
      { kind: 'meet', text: 'Meet the contact — on foot', target: 'meet' },
      { kind: 'escape', text: 'Lose the tail — reach the safehouse', target: 'safehouse', wanted: 2 },
    ],
    reward: 400,
  },
  {
    name: 'King of Palmara',
    steps: [
      { kind: 'steal', text: 'Steal the sports car at the Marina', carKind: 'sports' },
      { kind: 'goto', text: 'Reach the Penthouse Garage', target: 'garage', wanted: 4 },
    ],
    reward: 600,
  },
];

const PED_COLORS = ['#e8b4b8', '#a8c8e8', '#e8d5a4', '#b8e8c8', '#d8a8e8', '#e8a87c', '#a8d8e8'];

export function createWorld(random, city) {
  const state = {
    time: 0,
    money: 0,
    earned: 0,
    health: PLAYER.hp,
    wanted: 0,
    quietTimer: 0,
    mission: 0,
    step: 0,
    missionTimer: 0,
    bags: [],
    carrying: false,
    over: null,
    overApplied: false,
    win: false,
    banner: null,
    bannerTimer: 0,
    camera: { x: city.spawn.x, y: city.spawn.y, shake: 0 },
    prompt: null,
    policeSpawnTimer: 0,
    copSpawnTimer: 0,
    pickupTimer: 8,
  };
  const player = {
    x: city.spawn.x, y: city.spawn.y, angle: 0, hp: PLAYER.hp,
    onFoot: true, car: null, ammo: PLAYER.startAmmo, reserve: PLAYER.startReserve,
    punchCd: 0, shootCd: 0, reloadTimer: 0, arrestTimer: 0, invuln: 0, moving: false,
  };
  const cars = [];
  const peds = [];
  const cops = [];
  const particles = [];
  const skids = [];
  const pickups = [];
  const policeCars = [];

  function showBanner(title, sub) {
    state.banner = { title, sub: sub || '' };
    state.bannerTimer = 3.2;
  }

  function spawnParticles(x, y, kind, n) {
    for (let i = 0; i < n; i += 1) {
      if (particles.length >= 240) return;
      const a = random() * TAU;
      const sp = kind === 'spark' ? 260 + random() * 260 : 40 + random() * 120;
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, maxLife: kind === 'smoke' ? 1.4 + random() : 0.4 + random() * 0.4,
        size: kind === 'smoke' ? 10 + random() * 10 : 2 + random() * 3,
        kind,
      });
    }
  }

  function addSkid(x, y, angle) {
    if (skids.length >= 300) skids.shift();
    skids.push({ x, y, angle, life: 4 });
  }

  function makeCar(kind, x, y, angle, driver) {
    const spec = CARS[kind];
    return {
      kind, x, y, angle, speed: 0, hp: spec.hp, driver,
      body: spec.body, glass: spec.glass, stolen: false,
      route: [], routeIdx: 0, cruise: TRAFFIC_SPEED * (0.8 + random() * 0.4),
      repathTimer: 0, stuckTimer: 0, reverseTimer: 0, flash: 0, sirenPhase: random() * TAU,
    };
  }

  function spawnTraffic() {
    const kinds = ['sedan', 'sedan', 'taxi', 'sedan', 'sports', 'truck', 'taxi'];
    for (let i = 0; i < 12; i += 1) {
      const p = randomRoadPoint(random, 1800, 1300, 0);
      const vertical = ROADS_X.includes(p.x);
      const car = makeCar(randPick(random, kinds), p.x, p.y, vertical ? Math.PI / 2 : 0, 'traffic');
      car.route = [p];
      car.routeIdx = 0;
      cars.push(car);
    }
    // Parked cars along the roadsides, free for the taking.
    for (let i = 0; i < 10; i += 1) {
      const vertical = random() < 0.5;
      const road = vertical ? randPick(random, ROADS_X) : randPick(random, ROADS_Y);
      const along = 260 + random() * (vertical ? WORLD.height - 520 : WORLD.width - 700);
      const side = random() < 0.5 ? -1 : 1;
      const x = vertical ? road + side * (ROAD_W / 2 + 22) : along;
      const y = vertical ? along : road + side * (ROAD_W / 2 + 22);
      if (x > SEA_X - 60) continue;
      const car = makeCar(randPick(random, kinds), x, y, vertical ? Math.PI / 2 : 0, 'parked');
      cars.push(car);
    }
  }

  function spawnPeds() {
    for (let i = 0; i < 26; i += 1) {
      const p = randomRoadPoint(random, 1800, 1300, 0);
      const side = random() < 0.5 ? -1 : 1;
      peds.push({
        x: p.x + side * (ROAD_W / 2 + 14 + random() * 20),
        y: p.y + (random() - 0.5) * 60,
        angle: random() * TAU, hp: 50, state: 'walk', color: randPick(random, PED_COLORS),
        speed: 55 + random() * 40, tx: p.x, ty: p.y, fleeTimer: 0, downTimer: 0,
      });
    }
  }

  function spawnPickups() {
    pickups.push({ kind: 'ammo', x: 2580, y: 300, taken: false });
    pickups.push({ kind: 'health', x: 700, y: 1500, taken: false });
    pickups.push({ kind: 'ammo', x: 1500, y: 700, taken: false });
  }

  function missionTarget(name) {
    if (name === 'spray') return city.shops.spray;
    if (name === 'arms') return city.shops.arms;
    if (name === 'hospital') return city.shops.hospital;
    return city.places[name];
  }

  function startMission(index) {
    state.mission = index;
    state.step = 0;
    state.bags = [];
    state.carrying = false;
    const mission = MISSIONS[index];
    if (!mission) return;
    const step = mission.steps[0];
    if (step.kind === 'collect') {
      state.bags = step.bags.map(([x, y]) => ({ x, y, taken: false }));
    }
    if (step.kind === 'survive' || step.wanted) state.wanted = Math.max(state.wanted, step.wanted || 0);
    if (step.timer) state.missionTimer = step.timer;
    if (index === 5) {
      // The prize sports car waits at the Marina.
      const car = makeCar('sports', city.places.marina.x, city.places.marina.y + 30, Math.PI / 2, 'parked');
      cars.push(car);
    }
    showBanner(`Mission ${index + 1}: ${mission.name}`, step.text);
  }

  function completeStep() {
    const mission = MISSIONS[state.mission];
    state.step += 1;
    if (state.step >= mission.steps.length) {
      state.money += mission.reward;
      state.earned += mission.reward;
      showBanner('Mission complete', `+$${mission.reward} — ${mission.name}`);
      if (state.mission + 1 >= MISSIONS.length) {
        state.win = true;
        state.over = 'win';
        return EVENT_MISSION | EVENT_WIN;
      }
      startMission(state.mission + 1);
      return EVENT_MISSION;
    }
    const step = mission.steps[state.step];
    if (step.kind === 'collect') state.bags = step.bags.map(([x, y]) => ({ x, y, taken: false }));
    if (step.timer) state.missionTimer = step.timer;
    if (step.wanted) state.wanted = Math.max(state.wanted, step.wanted);
    showBanner(mission.name, step.text);
    return EVENT_MISSION;
  }

  function addWanted(n) {
    const before = state.wanted;
    state.wanted = Math.min(5, state.wanted + n);
    state.quietTimer = 0;
    if (state.wanted !== before) return EVENT_WANTED;
    return EVENT_NONE;
  }

  function reset() {
    state.time = 0;
    state.money = 0;
    state.earned = 0;
    state.health = PLAYER.hp;
    state.wanted = 0;
    state.quietTimer = 0;
    state.missionTimer = 0;
    state.bags = [];
    state.carrying = false;
    state.over = null;
    state.overApplied = false;
    state.win = false;
    state.banner = null;
    state.bannerTimer = 0;
    state.prompt = null;
    state.policeSpawnTimer = 0;
    state.copSpawnTimer = 0;
    state.pickupTimer = 8;
    player.x = city.spawn.x;
    player.y = city.spawn.y;
    player.angle = 0;
    player.hp = PLAYER.hp;
    player.onFoot = true;
    player.car = null;
    player.ammo = PLAYER.startAmmo;
    player.reserve = PLAYER.startReserve;
    player.punchCd = 0;
    player.shootCd = 0;
    player.reloadTimer = 0;
    player.arrestTimer = 0;
    player.invuln = 0;
    cars.length = 0;
    peds.length = 0;
    cops.length = 0;
    particles.length = 0;
    skids.length = 0;
    pickups.length = 0;
    policeCars.length = 0;
    spawnTraffic();
    spawnPeds();
    spawnPickups();
    startMission(0);
    state.camera.x = player.x;
    state.camera.y = player.y;
    state.camera.shake = 0;
  }

  // ---- collision helpers -------------------------------------------------
  function axlePush(x, y, r) {
    let px = 0;
    let py = 0;
    let hit = false;
    for (const b of city.buildings) {
      const cx = Math.max(b.x, Math.min(x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(y, b.y + b.h));
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 < 0.0001) { px += r; continue; }
      const d = Math.sqrt(d2);
      const push = r - d;
      px += (dx / d) * push;
      py += (dy / d) * push;
    }
    return hit ? { dx: px, dy: py } : null;
  }

  /** Slide a car along buildings with two axle circles; returns true on a hit. */
  function collideCar(car) {
    const spec = CARS[car.kind];
    const r = spec.width * 0.62;
    let hit = false;
    for (const s of [0.3, -0.3]) {
      const ax = car.x + Math.cos(car.angle) * spec.length * s;
      const ay = car.y + Math.sin(car.angle) * spec.length * s;
      const push = axlePush(ax, ay, r);
      if (!push) continue;
      hit = true;
      car.x += push.dx;
      car.y += push.dy;
    }
    return hit;
  }

  function collideCarPair(a, b) {
    const ra = CARS[a.kind].length * 0.42;
    const rb = CARS[b.kind].length * 0.42;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d >= ra + rb || d < 0.001) return 0;
    const overlap = (ra + rb - d) / 2;
    const nx = dx / d;
    const ny = dy / d;
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    b.x += nx * overlap;
    b.y += ny * overlap;
    return Math.abs(a.speed - b.speed);
  }

  // ---- driving -------------------------------------------------------------
  function stepPlayerCar(car, input, dt) {
    const spec = CARS[car.kind];
    const road = onRoad(car.x, car.y, 6) || onBeach(car.x);
    const top = spec.topSpeed * (road ? 1 : 0.55);
    if (car.disabled) {
      car.speed = Math.max(0, car.speed - 300 * dt);
    } else if (input.my > 0) {
      car.speed += spec.accel * dt;
    } else if (input.my < 0) {
      car.speed = car.speed > 10 ? car.speed - spec.brake * dt : car.speed - spec.accel * 0.5 * dt;
    } else {
      car.speed -= Math.sign(car.speed) * 140 * dt;
      if (Math.abs(car.speed) < 6) car.speed = 0;
    }
    car.speed = clamp(car.speed, -140, top);
    const spd = Math.abs(car.speed) / spec.topSpeed;
    car.angle += input.mx * spec.grip * Math.max(0.18, spd) * dt * (car.speed >= 0 ? 1 : -1);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 24, WORLD.width - 24);
    car.y = clamp(car.y, 24, WORLD.height - 24);
    const before = car.speed;
    if (collideCar(car)) {
      car.speed *= 0.6;
      if (Math.abs(before) > 220) {
        spawnParticles(car.x, car.y, 'spark', 8);
        state.camera.shake = Math.min(1, state.camera.shake + 0.5);
      }
    }
    if (!road && Math.abs(car.speed) > 130 && random() < 0.4) {
      spawnParticles(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 'dust', 1);
    }
    if (Math.abs(input.mx) > 0.55 && Math.abs(car.speed) > 200) {
      addSkid(car.x - Math.cos(car.angle) * 24, car.y - Math.sin(car.angle) * 24, car.angle);
    }
    if (car.hp <= 0 && !car.disabled) {
      car.disabled = true;
      spawnParticles(car.x, car.y, 'smoke', 12);
      spawnParticles(car.x, car.y, 'spark', 10);
      state.camera.shake = 1;
    }
    if (car.disabled && random() < 0.3) spawnParticles(car.x, car.y, 'smoke', 1);
  }

  function steerToward(car, tx, ty, dt, throttle) {
    const want = Math.atan2(ty - car.y, tx - car.x);
    const diff = angleDiff(car.angle, want);
    const steer = clamp(diff * 2.4, -1, 1);
    const spec = CARS[car.kind];
    car.speed += (throttle * spec.accel * 0.6 - Math.abs(car.speed) * 0.4) * dt;
    car.speed = clamp(car.speed, 0, spec.topSpeed * 0.75);
    const spd = Math.max(0.2, Math.abs(car.speed) / spec.topSpeed);
    car.angle += steer * spec.grip * spd * dt;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 24, WORLD.width - 24);
    car.y = clamp(car.y, 24, WORLD.height - 24);
    if (collideCar(car)) car.speed *= 0.7;
  }

  function stepTrafficCar(car, dt) {
    if (car.hp <= 0) {
      car.speed = Math.max(0, car.speed - 200 * dt);
      return;
    }
    if (car.routeIdx >= car.route.length) {
      const dest = randomRoadPoint(random, car.x, car.y, 500);
      car.route = findPath(car, dest);
      car.routeIdx = 0;
      if (car.route.length === 0) car.route = [{ x: car.x, y: car.y }];
    }
    const target = car.route[car.routeIdx];
    if (dist(car.x, car.y, target.x, target.y) < 42) {
      car.routeIdx += 1;
      return;
    }
    // Ease off when another car is right ahead.
    let throttle = 1;
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 140 && d > 1 && (dx * Math.cos(car.angle) + dy * Math.sin(car.angle)) / d > 0.6) {
        // Brake early and stop behind the car ahead, never rear-end it.
        throttle = 0;
        car.speed *= 0.9;
        break;
      }
    }
    const want = Math.atan2(target.y - car.y, target.x - car.x);
    const diff = angleDiff(car.angle, want);
    const steer = clamp(diff * 2.4, -1, 1);
    const spec = CARS[car.kind];
    car.speed += (throttle * spec.accel * 0.5 - Math.abs(car.speed) * 0.5) * dt;
    car.speed = clamp(car.speed, 0, car.cruise);
    const spd = Math.max(0.2, Math.abs(car.speed) / spec.topSpeed);
    car.angle += steer * spec.grip * spd * dt;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (collideCar(car)) car.speed *= 0.7;
  }

  function stepPoliceCar(car, dt) {
    const px = player.onFoot ? player.x : player.car ? player.car.x : player.x;
    const py = player.onFoot ? player.y : player.car ? player.car.y : player.y;
    const d = dist(car.x, car.y, px, py);
    car.repathTimer -= dt;
    // After a ram the cop backs off and coasts, so the player can pull away.
    if (car.ramCd > 0) {
      car.ramCd -= dt;
      steerToward(car, px, py, dt, 0);
      return;
    }
    if (d > POLICE_RAM_RANGE) {
      if (car.repathTimer <= 0 || car.routeIdx >= car.route.length) {
        car.route = findPath(car, { x: px, y: py });
        car.routeIdx = 0;
        car.repathTimer = 1.5;
      }
      const target = car.route[car.routeIdx] || { x: px, y: py };
      if (dist(car.x, car.y, target.x, target.y) < 46) car.routeIdx += 1;
      else steerToward(car, target.x, target.y, dt, 1);
    } else {
      steerToward(car, px, py, dt, 1);
    }
    // A police car that reaches an on-foot player parks and sends a cop out.
    if (player.onFoot && d < 130 && cops.length < 3 && random() < 0.02) {
      cops.push({ x: car.x, y: car.y, angle: 0, hp: 100, punchCd: 0, arrestTimer: 0 });
    }
  }

  function stepPed(ped, dt) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0 && ped.hp > 0) ped.state = 'walk';
      return;
    }
    const px = player.onFoot ? player.x : player.car ? player.car.x : player.x;
    const py = player.onFoot ? player.y : player.car ? player.car.y : player.y;
    const d = dist(ped.x, ped.y, px, py);
    if (ped.fleeTimer > 0) {
      ped.fleeTimer -= dt;
      const a = Math.atan2(ped.y - py, ped.x - px);
      ped.x += Math.cos(a) * 230 * dt;
      ped.y += Math.sin(a) * 230 * dt;
    } else if (d < 90 && !player.onFoot && player.car && Math.abs(player.car.speed) > 60) {
      ped.fleeTimer = 2.5;
    } else {
      if (dist(ped.x, ped.y, ped.tx, ped.ty) < 24) {
        const p = randomRoadPoint(random, ped.x, ped.y, 200);
        ped.tx = p.x + (random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 16);
        ped.ty = p.y;
      }
      const a = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
      ped.angle = a;
      ped.x += Math.cos(a) * ped.speed * dt;
      ped.y += Math.sin(a) * ped.speed * dt;
    }
    ped.x = clamp(ped.x, 20, WORLD.width - 20);
    ped.y = clamp(ped.y, 20, WORLD.height - 20);
    const body = { x: ped.x, y: ped.y, r: 12 };
    if (collideBuildings(city, body)) { ped.x = body.x; ped.y = body.y; }
  }

  function stepCop(cop, dt) {
    if (!player.onFoot) return;
    const d = dist(cop.x, cop.y, player.x, player.y);
    const a = Math.atan2(player.y - cop.y, player.x - cop.x);
    cop.angle = a;
    if (d > 34) {
      cop.x += Math.cos(a) * 205 * dt;
      cop.y += Math.sin(a) * 205 * dt;
      cop.arrestTimer = 0;
    } else {
      cop.arrestTimer += dt;
      cop.punchCd -= dt;
      if (cop.punchCd <= 0) {
        cop.punchCd = 1;
        if (player.invuln <= 0) {
          player.hp -= 8;
          player.invuln = 0.4;
          spawnParticles(player.x, player.y, 'spark', 4);
        }
      }
      if (cop.arrestTimer >= ARREST_SECONDS) {
        state.over = 'busted';
      }
    }
    const body = { x: cop.x, y: cop.y, r: 12 };
    if (collideBuildings(city, body)) { cop.x = body.x; cop.y = body.y; }
  }

  function damagePed(ped, amount, fromX, fromY) {
    ped.hp -= amount;
    ped.fleeTimer = 3;
    spawnParticles(ped.x, ped.y, 'spark', 5);
    if (ped.hp <= 0) {
      ped.state = 'down';
      ped.downTimer = 20;
    } else {
      const a = Math.atan2(ped.y - fromY, ped.x - fromX);
      ped.x += Math.cos(a) * 14;
      ped.y += Math.sin(a) * 14;
    }
  }

  function damageCop(cop, amount) {
    cop.hp -= amount;
    spawnParticles(cop.x, cop.y, 'spark', 5);
    if (cop.hp <= 0) {
      const i = cops.indexOf(cop);
      if (i >= 0) cops.splice(i, 1);
      spawnParticles(cop.x, cop.y, 'smoke', 6);
    }
  }

  function nearestCar(x, y, maxD, kinds) {
    let best = null;
    let bestD = maxD;
    for (const car of cars) {
      if (kinds && !kinds.includes(car.kind)) continue;
      if (car.driver === 'police') continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar(car) {
    player.onFoot = false;
    player.car = car;
    car.driver = 'player';
    cops.length = 0;
    const mission = MISSIONS[state.mission];
    const step = mission && mission.steps[state.step];
    let events = EVENT_NONE;
    if (step && step.kind === 'steal' && (!step.carKind || car.kind === step.carKind)) {
      events |= completeStep();
    }
    if (!car.stolen) {
      car.stolen = true;
      events |= addWanted(1);
      showBanner('Car stolen', 'The heat is on — watch the stars');
    }
    return events;
  }

  function exitCar() {
    const car = player.car;
    if (!car) return;
    const side = { x: Math.cos(car.angle + Math.PI / 2), y: Math.sin(car.angle + Math.PI / 2) };
    player.x = car.x + side.x * 44;
    player.y = car.y + side.y * 44;
    player.angle = car.angle;
    player.onFoot = true;
    player.car = null;
    car.driver = 'parked';
    car.speed = 0;
  }

  function useShop(shop) {
    if (shop.kind === 'spray') {
      if (!player.car || state.money < shop.price) return EVENT_NONE;
      state.money -= shop.price;
      state.wanted = 0;
      player.car.body = randPick(random, ['#3e6fb5', '#d7263d', '#2a9d8f', '#e9c46a', '#7a5fa5']);
      showBanner('Fresh paint', 'Wanted level cleared');
      return EVENT_PICKUP;
    }
    if (shop.kind === 'arms') {
      if (state.money < shop.price) return EVENT_NONE;
      state.money -= shop.price;
      player.reserve += 24;
      showBanner('Ammo bought', '+24 rounds');
      return EVENT_PICKUP;
    }
    if (shop.kind === 'hospital') {
      if (state.money < shop.price || player.hp >= PLAYER.hp) return EVENT_NONE;
      state.money -= shop.price;
      player.hp = PLAYER.hp;
      showBanner('Patched up', 'Full health');
      return EVENT_PICKUP;
    }
    return EVENT_NONE;
  }

  function nearestShop(x, y) {
    let best = null;
    let bestD = 110;
    for (const key of Object.keys(city.shops)) {
      const s = city.shops[key];
      const d = dist(x, y, s.x, s.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  function updateMission(dt) {
    const mission = MISSIONS[state.mission];
    if (!mission) return EVENT_NONE;
    const step = mission.steps[state.step];
    if (!step) return EVENT_NONE;
    const px = player.onFoot ? player.x : player.car.x;
    const py = player.onFoot ? player.y : player.car.y;
    if (step.timer) {
      state.missionTimer -= dt;
      // Only a delivery can run out of time; surviving the timer IS the goal.
      if (state.missionTimer <= 0 && step.kind === 'deliver') {
        showBanner('Too slow', 'The mission restarts — try again');
        startMission(state.mission);
        return EVENT_MISSION;
      }
    }
    if (step.kind === 'goto' || step.kind === 'deliver' || step.kind === 'escape') {
      const t = missionTarget(step.target);
      if (dist(px, py, t.x, t.y) < 85) return completeStep();
    } else if (step.kind === 'collect') {
      if (state.bags.every((b) => b.taken)) return completeStep();
    } else if (step.kind === 'survive') {
      if (state.missionTimer <= 0) return completeStep();
    } else if (step.kind === 'meet') {
      if (player.onFoot) {
        const t = missionTarget(step.target);
        if (dist(px, py, t.x, t.y) < 75) return completeStep();
      }
    }
    return EVENT_NONE;
  }

  function spawnPolice(dt) {
    if (state.wanted === 0) {
      // The heat is off: police cars blend back into traffic.
      for (const car of cars) {
        if (car.driver === 'police') { car.driver = 'traffic'; car.route = []; car.routeIdx = 0; }
      }
      policeCars.length = 0;
      return;
    }
    const desired = Math.min(1 + Math.floor(state.wanted / 2), 3);
    state.policeSpawnTimer -= dt;
    if (policeCars.length < desired && state.policeSpawnTimer <= 0) {
      state.policeSpawnTimer = 3;
      const p = randomRoadPoint(random, player.x, player.y, 750);
      const car = makeCar('police', p.x, p.y, 0, 'police');
      car.sirenPhase = random() * TAU;
      cars.push(car);
      policeCars.push(car);
    }
    // On-foot cops only hunt a player on foot.
    if (player.onFoot) {
      const wantCops = Math.min(state.wanted - 1, 3);
      state.copSpawnTimer -= dt;
      if (cops.length < Math.max(0, wantCops) && state.copSpawnTimer <= 0) {
        state.copSpawnTimer = 4;
        const p = randomRoadPoint(random, player.x, player.y, 260);
        cops.push({ x: p.x, y: p.y, angle: 0, hp: 100, punchCd: 0, arrestTimer: 0 });
      }
    }
  }

  function stepPlayer(dt, input) {
    let events = EVENT_NONE;
    if (player.invuln > 0) player.invuln -= dt;
    if (player.punchCd > 0) player.punchCd -= dt;
    if (player.shootCd > 0) player.shootCd -= dt;
    if (player.reloadTimer > 0) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0) {
        const need = PLAYER.magSize - player.ammo;
        const take = Math.min(need, player.reserve);
        player.ammo += take;
        player.reserve -= take;
      }
    }

    if (!player.onFoot && player.car) {
      stepPlayerCar(player.car, input, dt);
      // The player's position is the car's while driving (minimap, police, HUD).
      player.x = player.car.x;
      player.y = player.car.y;
      player.angle = player.car.angle;
      if (input.interact) {
        const shop = nearestShop(player.car.x, player.car.y);
        if (shop && shop.kind === 'spray' && state.money >= shop.price && state.wanted > 0) {
          events |= useShop(shop);
        } else {
          exitCar();
        }
      }
      // Cash bags can be collected by driving over them.
      for (const bag of state.bags) {
        if (!bag.taken && dist(player.car.x, player.car.y, bag.x, bag.y) < 52) {
          bag.taken = true;
          events |= EVENT_PICKUP;
          spawnParticles(bag.x, bag.y, 'spark', 8);
        }
      }
      return events;
    }

    // On foot.
    const len = Math.hypot(input.mx || 0, input.my || 0);
    player.moving = len > 0.1;
    if (len > 0.1) {
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const nx = (input.mx || 0) / Math.max(1, len);
      const ny = (input.my || 0) / Math.max(1, len);
      player.x += nx * speed * dt;
      player.y += ny * speed * dt;
      player.angle = Math.atan2(ny, nx);
    }
    player.x = clamp(player.x, 20, SEA_X - 18);
    player.y = clamp(player.y, 20, WORLD.height - 20);
    const body = { x: player.x, y: player.y, r: PLAYER.radius };
    if (collideBuildings(city, body)) { player.x = body.x; player.y = body.y; }

    if (input.shoot && player.shootCd <= 0) {
      player.shootCd = PLAYER.shootCooldown;
      if (player.ammo > 0) {
        player.ammo -= 1;
        const tx = input.shootX ?? player.x + Math.cos(player.angle) * 100;
        const ty = input.shootY ?? player.y + Math.sin(player.angle) * 100;
        player.angle = Math.atan2(ty - player.y, tx - player.x);
        state.tracer = { x1: player.x, y1: player.y, x2: tx, y2: ty, life: 0.08 };
        spawnParticles(player.x + Math.cos(player.angle) * 20, player.y + Math.sin(player.angle) * 20, 'flash', 1);
        events |= EVENT_SHOT;
        // Hit the first thing near the aim line.
        const ax = Math.cos(player.angle);
        const ay = Math.sin(player.angle);
        let bestD = 620;
        let hit = null;
        let hitKind = null;
        for (const ped of peds) {
          if (ped.state === 'down') continue;
          const along = (ped.x - player.x) * ax + (ped.y - player.y) * ay;
          if (along < 0 || along > bestD) continue;
          const perp = Math.abs((ped.x - player.x) * ay - (ped.y - player.y) * ax);
          if (perp < 30) { bestD = along; hit = ped; hitKind = 'ped'; }
        }
        for (const cop of cops) {
          const along = (cop.x - player.x) * ax + (cop.y - player.y) * ay;
          if (along < 0 || along > bestD) continue;
          const perp = Math.abs((cop.x - player.x) * ay - (cop.y - player.y) * ax);
          if (perp < 30) { bestD = along; hit = cop; hitKind = 'cop'; }
        }
        for (const car of cars) {
          const along = (car.x - player.x) * ax + (car.y - player.y) * ay;
          if (along < 0 || along > bestD) continue;
          const perp = Math.abs((car.x - player.x) * ay - (car.y - player.y) * ax);
          if (perp < 34) { bestD = along; hit = car; hitKind = 'car'; }
        }
        if (hit) {
          if (hitKind === 'ped') { damagePed(hit, 34, player.x, player.y); events |= addWanted(1); }
          else if (hitKind === 'cop') { damageCop(hit, 34); events |= addWanted(1); }
          else { hit.hp -= 34; hit.flash = 0.2; spawnParticles(hit.x, hit.y, 'spark', 6); }
        }
      } else if (player.reserve > 0 && player.reloadTimer <= 0) {
        player.reloadTimer = 0.9;
      }
    }
    if (input.reload && player.reserve > 0 && player.ammo < PLAYER.magSize && player.reloadTimer <= 0) {
      player.reloadTimer = 0.9;
    }
    if (input.punch && player.punchCd <= 0) {
      player.punchCd = PLAYER.punchCooldown;
      const range = PLAYER.punchRange;
      let target = null;
      let targetKind = null;
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        if (dist(player.x, player.y, ped.x, ped.y) < range) { target = ped; targetKind = 'ped'; break; }
      }
      if (!target) {
        for (const cop of cops) {
          if (dist(player.x, player.y, cop.x, cop.y) < range) { target = cop; targetKind = 'cop'; break; }
        }
      }
      if (target) {
        if (targetKind === 'ped') { damagePed(target, PLAYER.punchDamage, player.x, player.y); events |= addWanted(1); }
        else { damageCop(target, PLAYER.punchDamage); events |= addWanted(1); }
      }
    }
    if (input.interact) {
      const shop = nearestShop(player.x, player.y);
      if (shop && shop.kind !== 'spray') events |= useShop(shop);
      else {
        const car = nearestCar(player.x, player.y, 72);
        if (car) events |= enterCar(car);
      }
    }

    // Cash bags and pickups.
    for (const bag of state.bags) {
      if (!bag.taken && dist(player.x, player.y, bag.x, bag.y) < 48) {
        bag.taken = true;
        events |= EVENT_PICKUP;
        spawnParticles(bag.x, bag.y, 'spark', 8);
      }
    }
    for (const pk of pickups) {
      if (pk.taken) continue;
      if (dist(player.x, player.y, pk.x, pk.y) < 38) {
        pk.taken = true;
        if (pk.kind === 'ammo') { player.reserve += 24; showBanner('Ammo', '+24 rounds'); }
        else { player.hp = Math.min(PLAYER.hp, player.hp + 40); showBanner('First aid', '+40 health'); }
        events |= EVENT_PICKUP;
      }
    }
    return events;
  }

  function stepCarCollisions(dt) {
    let events = EVENT_NONE;
    for (const car of cars) {
      if (car.hitCd > 0) car.hitCd -= dt;
    }
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const impact = collideCarPair(cars[i], cars[j]);
        // A wrecked car is already scrap: it takes no more damage.
        // And a pair that stays pressed together only counts as one hit
        // every half second — otherwise a single ram drains the whole bar.
        if (impact > 120 && !cars[i].disabled && !cars[j].disabled &&
            (cars[i].hitCd || 0) <= 0 && (cars[j].hitCd || 0) <= 0) {
          const mx = (cars[i].x + cars[j].x) / 2;
          const my = (cars[i].y + cars[j].y) / 2;
          spawnParticles(mx, my, 'spark', 5);
          const aPlayer = cars[i].driver === 'player';
          const bPlayer = cars[j].driver === 'player';
          const aPolice = cars[i].driver === 'police';
          const bPolice = cars[j].driver === 'police';
          const policePlayer = (aPolice && bPlayer) || (aPlayer && bPolice);
          const playerTraffic = (aPlayer && !bPolice) || (bPlayer && !aPolice);
          // The player's car is the hero car: a police ram is a shove and a
          // bump into traffic is paint damage, never a wrecking ball. NPCs
          // hitting each other take the full hit.
          const dmg = (policePlayer || playerTraffic)
            ? Math.min(3, impact * 0.02)
            : Math.min(4, impact * 0.03);
          if (policePlayer) {
            const cop = aPolice ? cars[i] : cars[j];
            cop.ramCd = 1.5;
          }
          cars[i].hp -= dmg;
          cars[j].hp -= dmg;
          cars[i].hitCd = 0.5;
          cars[j].hitCd = 0.5;
          if (policePlayer) {
            // A ram must not pin the player in a death spiral: the cop
            // loses most of its speed, the player keeps theirs and pulls away.
            const playerCar = aPlayer ? cars[i] : cars[j];
            const cop = aPolice ? cars[i] : cars[j];
            playerCar.speed *= 0.9;
            cop.speed *= 0.6;
          } else if (playerTraffic) {
            const playerCar = aPlayer ? cars[i] : cars[j];
            const other = aPlayer ? cars[j] : cars[i];
            playerCar.speed *= 0.85;
            other.speed *= 0.6;
          } else {
            cars[i].speed *= 0.6;
            cars[j].speed *= 0.6;
          }
          if ((cars[i].driver === 'player' || cars[j].driver === 'player') && impact > 160) {
            state.camera.shake = Math.min(1, state.camera.shake + 0.4);
            events |= EVENT_CRASH;
          }
          if ((cars[i].driver === 'police' || cars[j].driver === 'police') &&
              (cars[i].driver === 'player' || cars[j].driver === 'player')) {
            events |= addWanted(1);
          }
        }
      }
    }
    // Cars running over pedestrians.
    for (const car of cars) {
      if (Math.abs(car.speed) < 40) continue;
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        if (dist(car.x, car.y, ped.x, ped.y) < CARS[car.kind].length * 0.45) {
          damagePed(ped, 60, car.x, car.y);
          if (car.driver === 'player') events |= addWanted(1);
        }
      }
    }
    return events;
  }

  const VIEW_HALF_X = 640;
  const VIEW_HALF_Y = 360;

  function stepCamera(dt) {
    const focus = player.onFoot ? player : player.car || player;
    const look = 0.22;
    const tx = focus.x + (focus === player.car ? Math.cos(focus.angle) * focus.speed * look : 0);
    const ty = focus.y + (focus === player.car ? Math.sin(focus.angle) * focus.speed * look : 0);
    const k = 1 - Math.exp(-5 * dt);
    state.camera.x += (tx - state.camera.x) * k;
    state.camera.y += (ty - state.camera.y) * k;
    state.camera.x = clamp(state.camera.x, VIEW_HALF_X, WORLD.width - VIEW_HALF_X);
    state.camera.y = clamp(state.camera.y, VIEW_HALF_Y, WORLD.height - VIEW_HALF_Y);
    state.camera.shake = Math.max(0, state.camera.shake - dt * 1.6);
    // Deterministic shake offsets from the seeded generator.
    state.camera.shakeX = state.camera.shake * state.camera.shake * 14 * (random() * 2 - 1);
    state.camera.shakeY = state.camera.shake * state.camera.shake * 14 * (random() * 2 - 1);
  }

  function stepParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'spark') p.vy += 320 * dt;
      if (p.kind === 'smoke') { p.vy -= 26 * dt; p.size += 6 * dt; }
      if (p.kind === 'dust') { p.vx *= 0.96; p.vy *= 0.96; }
    }
    for (let i = skids.length - 1; i >= 0; i -= 1) {
      skids[i].life -= dt;
      if (skids[i].life <= 0) skids.splice(i, 1);
    }
    if (state.tracer) {
      state.tracer.life -= dt;
      if (state.tracer.life <= 0) state.tracer = null;
    }
    if (state.bannerTimer > 0) {
      state.bannerTimer -= dt;
      if (state.bannerTimer <= 0) state.banner = null;
    }
  }

  /**
   * One fixed step. `input` is the player's controls for this step; with
   * `harmless` set (the title screen's backdrop) the city lives but nothing
   * scores, nobody commits a crime and no mission advances.
   */
  function step(dt, input, harmless) {
    state.time += dt;
    let events = EVENT_NONE;
    if (!harmless) {
      events |= stepPlayer(dt, input || {});
      events |= updateMission(dt);
      spawnPolice(dt);
      if (state.wanted > 0) {
        state.quietTimer += dt;
        let nearest = Infinity;
        for (const car of cars) {
          if (car.driver !== 'police') continue;
          nearest = Math.min(nearest, dist(car.x, car.y, player.x, player.y));
        }
        if (state.quietTimer > WANTED_DECAY_SECONDS && nearest > 1200) {
          state.wanted -= 1;
          state.quietTimer = 0;
          events |= EVENT_WANTED;
        }
      }
      // Pickups respawn over time.
      state.pickupTimer -= dt;
      if (state.pickupTimer <= 0) {
        state.pickupTimer = 18;
        const gone = pickups.find((p) => p.taken);
        if (gone) gone.taken = false;
      }
      // Slow health regen out of trouble.
      if (player.hp > 0 && player.hp < PLAYER.hp && state.wanted === 0) {
        player.hp = Math.min(PLAYER.hp, player.hp + 2 * dt);
      }
      state.health = player.hp;
      if (player.hp <= 0 && !state.over) {
        state.over = 'down';
        events |= EVENT_DOWN;
      }
    }

    for (const car of cars) {
      if (car.driver === 'player') continue;
      if (car.driver === 'police') stepPoliceCar(car, dt);
      else if (car.driver === 'traffic') stepTrafficCar(car, dt);
      if (car.flash > 0) car.flash -= dt;
    }
    events |= stepCarCollisions(dt);
    for (const ped of peds) stepPed(ped, dt);
    for (let i = cops.length - 1; i >= 0; i -= 1) {
      if (state.over) break;
      stepCop(cops[i], dt);
    }
    // The price of getting caught, applied once: a fine for a bust, a cut for
    // a hospital stay, and the heat always comes off. A win costs nothing.
    if (state.over && !state.overApplied) {
      state.overApplied = true;
      if (state.over === 'busted') state.money = Math.max(0, state.money - 100);
      else if (state.over === 'down') state.money = Math.floor(state.money * 0.9);
      if (state.over !== 'win') state.wanted = 0;
    }
    stepParticles(dt);
    stepCamera(dt);
    return events;
  }

  /** The current mission objective for the HUD: name, text, bag count, timer. */
  function missionInfo() {
    const mission = MISSIONS[state.mission];
    if (!mission) return null;
    const step = mission.steps[state.step];
    if (!step) return null;
    const info = { name: `Mission ${state.mission + 1}: ${mission.name}`, text: step.text };
    if (step.kind === 'collect') {
      info.bags = { taken: state.bags.filter((b) => b.taken).length, total: state.bags.length };
    }
    if (step.timer) info.timer = Math.max(0, state.missionTimer);
    return info;
  }

  /** The world point the waypoint arrow and minimap should mark, or null. */
  function currentTarget() {
    const mission = MISSIONS[state.mission];
    if (!mission) return null;
    const step = mission.steps[state.step];
    if (!step) return null;
    if (step.kind === 'collect') {
      const next = state.bags.find((b) => !b.taken);
      return next ? { x: next.x, y: next.y } : null;
    }
    if (step.kind === 'steal') {
      const car = nearestCar(player.x, player.y, 100000, step.carKind ? [step.carKind] : null);
      return car ? { x: car.x, y: car.y } : null;
    }
    if (step.target) return missionTarget(step.target);
    return null;
  }

  /** Staging helpers used only by the screenshot scenes. */
  function forceMission(missionIndex, stepIndex) {
    startMission(missionIndex);
    state.step = stepIndex;
    const mission = MISSIONS[missionIndex];
    const step = mission.steps[stepIndex];
    if (step.kind === 'collect') state.bags = step.bags.map(([x, y]) => ({ x, y, taken: false }));
    if (step.kind === 'goto' || step.kind === 'deliver' || step.kind === 'escape') {
      state.bags = [];
      state.carrying = true;
    }
    if (step.timer) state.missionTimer = step.timer;
    if (step.wanted) state.wanted = Math.max(state.wanted, step.wanted);
  }

  function giveCar(kind, x, y, angle) {
    const car = makeCar(kind, x, y, angle, 'player');
    car.stolen = true;
    cars.push(car);
    player.onFoot = false;
    player.car = car;
    player.x = x;
    player.y = y;
    state.camera.x = x;
    state.camera.y = y;
    return car;
  }

  function teleportPlayer(x, y) {
    player.x = x;
    player.y = y;
    player.onFoot = true;
    player.car = null;
    state.camera.x = x;
    state.camera.y = y;
  }

  function setWanted(n) {
    state.wanted = n;
    state.quietTimer = 0;
  }

  reset();
  return {
    state, player, cars, peds, cops, particles, skids, pickups, city,
    reset, step, startMission, forceMission, giveCar, teleportPlayer, setWanted,
    missionInfo, missionTarget: currentTarget,
  };
}
