// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a
// road-following autopilot (breadth-first routes over the road grid, stuck detection
// with a reverse-out), so the frame is what a short game really looks like and the
// same seed always gives the same frame.
import { STEP } from './config.js';
import { findPath } from './city.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_LIMIT_SECONDS = 100;
const CHASE_SECONDS = 35;
const END_LIMIT_SECONDS = 120;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** A driver that follows the road grid to a target point. */
function makeDriver(world) {
  let route = [];
  let finalTarget = null;
  let stuckTimer = 0;
  let reverseTimer = 0;
  let reverseSteer = 1;
  let checkTimer = 0;

  function planTo(tx, ty) {
    const car = world.player.car;
    if (!car) return;
    route = findPath(car, { x: tx, y: ty });
    route.push({ x: tx, y: ty });
    finalTarget = { x: tx, y: ty };
  }

  function drive(target) {
    const car = world.player.car;
    if (!car) return { mx: 0, my: 0 };
    if (!finalTarget || dist(finalTarget.x, finalTarget.y, target.x, target.y) > 60) {
      planTo(target.x, target.y);
    }
    while (route.length > 0 && dist(car.x, car.y, route[0].x, route[0].y) < 55) route.shift();
    if (route.length === 0) {
      if (finalTarget) planTo(finalTarget.x, finalTarget.y);
      return { mx: 0, my: 0 };
    }
    const wp = route[0];
    const want = Math.atan2(wp.y - car.y, wp.x - car.x);
    const diff = angleDiff(car.angle, want);
    let mx = clamp(diff * 2.2, -1, 1);
    // Sharp turn (near U-turn): reverse and swing the rear around
    // (a three-point turn) instead of driving forward into the block
    // while turning. Ordinary 90° corners just slow down and turn.
    let my = Math.abs(diff) > 2.0 ? -0.7 : Math.abs(diff) < 0.6 ? 1 : 0.35;
    if (Math.abs(diff) > 2.0) mx = -mx;
    // Approaching a corner at speed: brake early so the turn stays inside
    // the intersection instead of arcing off the road.
    if (route.length > 1 && my > 0) {
      const wp1 = route[1];
      const d0 = dist(car.x, car.y, wp.x, wp.y);
      if (d0 < 200) {
        const aIn = Math.atan2(wp.y - car.y, wp.x - car.x);
        const aOut = Math.atan2(wp1.y - wp.y, wp1.x - wp.x);
        const turn = Math.abs(angleDiff(aIn, aOut));
        if (turn > 0.9 && Math.abs(car.speed) > 180) my = -0.6;
      }
    }
    // Stuck against a wall or another car: reverse out, then carry on.
    // (Speed, not position: a wedged car is shoved around by collisions
    // even though its own speed is zero.)
    checkTimer += STEP;
    if (checkTimer >= 0.5) {
      checkTimer = 0;
      if (Math.abs(car.speed) < 30 && my > 0.5) stuckTimer += 0.5;
      else stuckTimer = 0;
    }
    if (stuckTimer > 1.2) {
      reverseTimer = 1.2;
      // Alternate the reverse steer so the car swings around and escapes in
      // a new direction instead of shuttling into the same blocker.
      reverseSteer = -reverseSteer;
      stuckTimer = 0;
    }
    if (reverseTimer > 0) {
      reverseTimer -= STEP;
      return { mx: reverseSteer, my: -0.8 };
    }
    return { mx, my };
  }

  return { drive, planTo };
}

function summary(world, scene) {
  const state = world.state;
  const player = world.player;
  const car = player.car;
  const tgt = world.missionTarget();
  return {
    scene,
    mission: state.mission,
    step: state.step,
    money: state.money,
    wanted: state.wanted,
    speed: car ? Math.round(Math.abs(car.speed)) : 0,
    hp: car ? Math.round(car.hp) : 0,
    x: Math.round(player.x),
    y: Math.round(player.y),
    target: tgt ? { x: Math.round(tgt.x), y: Math.round(tgt.y) } : null,
    cars: world.cars.length,
    police: world.cars.filter((c) => c.driver === 'police').length,
    peds: world.peds.length,
    over: state.over,
  };
}

/**
 * Set `world` to the named scene and return the screen to draw over it, the best
 * score to show and a summary for the console.
 */
export function stageShot(name, world) {
  world.reset();
  const driver = makeDriver(world);
  if (name !== 'play' && name !== 'chase' && name !== 'end') {
    // Title backdrop: a busy downtown intersection, traffic rolling through.
    world.teleportPlayer(1400, 1000);
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, {}, true);
    return { screen: SCREEN_TITLE, best: 0, summary: summary(world, 'start') };
  }

  if (name === 'play') {
    world.forceMission(1, 0);
    world.giveCar('sedan', 1400, 880, Math.PI / 2);
    let steps = 0;
    for (; steps < PLAY_LIMIT_SECONDS / STEP; steps += 1) {
      const target = world.missionTarget();
      if (!target) break;
      const input = driver.drive(target);
      world.step(STEP, input, false);
      if (world.state.mission > 1) {
        // Mission 1 is done (cash delivered). Keep driving a few seconds so
        // the mission-complete banner fades before the frame is taken.
        for (let extra = 0; extra < 240; extra += 1) {
          const t2 = world.missionTarget();
          if (!t2) break;
          world.step(STEP, driver.drive(t2), false);
        }
        break;
      }
      if (world.state.over) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.money, summary: summary(world, 'play') };
  }

  if (name === 'chase') {
    world.forceMission(1, 0);
    world.giveCar('sports', 1400, 1000, 0);
    world.setWanted(3);
    // Flee in a big rectangle around the city: long straights at top speed
    // (the sports car outruns the police), 90° corners taken in the open
    // intersection. Advance to the next corner when the car gets close.
    const loop = [
      { x: 3200, y: 1000 },
      { x: 3200, y: 2200 },
      { x: 600, y: 2200 },
      { x: 600, y: 600 },
      { x: 3200, y: 600 },
    ];
    let loopIdx = 0;
    let fleeTarget = loop[0];
    let steps = 0;
    for (; steps < CHASE_SECONDS / STEP; steps += 1) {
      const car = world.player.car;
      if (car && dist(car.x, car.y, fleeTarget.x, fleeTarget.y) < 200) {
        loopIdx = (loopIdx + 1) % loop.length;
        fleeTarget = loop[loopIdx];
      }
      const input = driver.drive(fleeTarget);
      world.step(STEP, input, false);
      if (world.state.over) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.money, summary: summary(world, 'chase') };
  }

  // end: the Cash Run delivery leg — bags already collected, drive to the safehouse.
  world.forceMission(1, 1);
  world.giveCar('sedan', 1000, 1400, Math.PI / 4);
  let steps = 0;
  for (; steps < END_LIMIT_SECONDS / STEP; steps += 1) {
    const target = world.missionTarget();
    if (!target) break;
    const input = driver.drive(target);
    world.step(STEP, input, false);
    if (world.state.mission > 1) {
      // Cash delivered. Keep driving a few seconds so the mission-complete
      // banner fades before the frame is taken.
      for (let extra = 0; extra < 240; extra += 1) {
        const t2 = world.missionTarget();
        if (!t2) break;
        world.step(STEP, driver.drive(t2), false);
      }
      break;
    }
    if (world.state.over) break;
  }
  return { screen: SCREEN_PLAY, best: world.state.money, summary: summary(world, 'end') };
}
