// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play, paused,
// busted, knocked out and King of Palmara. Progress (mission and money) is saved
// to localStorage whenever a mission is completed.
//
// ?seed=N fixes the city and the traffic. ?shot=start|play|chase|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice, logs its summary
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, CARS, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_DOWN, EVENT_MISSION, EVENT_PICKUP, EVENT_SHOT, EVENT_WANTED } from './world.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_RELOAD, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_DOWN, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const city = createCity(createRandom(seed));
const world = createWorld(createRandom(seed), city);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.mission !== 'number' || typeof save.money !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ mission: world.state.mission, money: world.state.money }));
  } catch {
    // Storage can be off: progress then lasts this visit only.
  }
}

function applySave() {
  const save = readSave();
  if (!save || save.mission <= 0) return;
  world.startMission(Math.min(save.mission, 5));
  world.state.money = Math.max(0, save.money);
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  console.log(`SHOT ${name} ` + JSON.stringify(scene.summary));
  function paint() {
    renderer.setCamera(world.state.camera);
    renderer.draw(world, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let muted = false;

  // A probe hook for headless play-tests: the live state as plain data.
  window.__state = () => ({
    screen,
    money: world.state.money,
    mission: world.state.mission,
    step: world.state.step,
    wanted: world.state.wanted,
    hp: world.player.hp,
    onFoot: world.player.onFoot,
    x: Math.round(world.player.x),
    y: Math.round(world.player.y),
    speed: world.player.car ? Math.round(Math.abs(world.player.car.speed)) : 0,
    over: world.state.over,
    cars: world.cars.length,
    police: world.cars.filter((c) => c.driver === 'police').length,
  });

  function announce(message) {
    status.textContent = message;
  }

  function nearestShop(x, y) {
    let bestShop = null;
    let bestD = 110;
    for (const key of Object.keys(city.shops)) {
      const s = city.shops[key];
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestD) { bestD = d; bestShop = s; }
    }
    return bestShop;
  }

  function nearestStealable(x, y) {
    let bestCar = null;
    let bestD = 76;
    for (const car of world.cars) {
      if (car.driver === 'police') continue;
      const d = Math.hypot(car.x - x, car.y - y);
      if (d < bestD) { bestD = d; bestCar = car; }
    }
    return bestCar;
  }

  function computePrompt() {
    const state = world.state;
    const player = world.player;
    if (state.over) {
      state.prompt = null;
      return;
    }
    if (!player.onFoot && player.car) {
      const shop = nearestShop(player.car.x, player.car.y);
      if (shop && shop.kind === 'spray' && state.money >= shop.price && state.wanted > 0) {
        state.prompt = `E — Respray $${shop.price} (clears wanted)`;
        return;
      }
      state.prompt = 'E — Get out';
      return;
    }
    const shop = nearestShop(player.x, player.y);
    if (shop) {
      if (shop.kind === 'arms') state.prompt = `E — Ammo $${shop.price} (+24)`;
      else if (shop.kind === 'hospital') state.prompt = `E — Patch up $${shop.price}`;
      else state.prompt = 'Get in a car to respray';
      return;
    }
    if (nearestStealable(player.x, player.y)) {
      state.prompt = 'E — Steal car';
      return;
    }
    state.prompt = null;
  }

  function startGame() {
    world.reset();
    applySave();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Mission 1: First Wheels.');
  }

  function restartAfterOver() {
    const over = world.state.over;
    world.reset();
    applySave();
    if (over === 'win') {
      // The crown is kept: free roam with everything unlocked.
      world.state.mission = 6;
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      muted = !muted;
      audio.setMuted(muted);
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) {
      audio.unlock();
      startGame();
    } else if (actions & ACTION_CONFIRM && (screen === SCREEN_BUSTED || screen === SCREEN_DOWN || screen === SCREEN_WIN)) {
      restartAfterOver();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, {}, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const simInput = {
      mx: input.move().mx,
      my: input.move().my,
      run: input.run(),
      shoot: input.shoot(),
      shootX: 0,
      shootY: 0,
      punch: Boolean(actions & ACTION_PUNCH),
      interact: Boolean(actions & ACTION_INTERACT),
      reload: Boolean(actions & ACTION_RELOAD),
    };
    const mouse = input.mouse();
    renderer.setCamera(world.state.camera);
    const aim = renderer.screenToWorld(mouse.x, mouse.y);
    simInput.shootX = aim.x;
    simInput.shootY = aim.y;
    const events = world.step(STEP, simInput, false);
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_MISSION) {
      audio.mission();
      writeSave();
      if (world.state.earned > best) {
        best = world.state.earned;
        saveBest(best);
      }
    }
    if (events & EVENT_WANTED) announce(`Wanted level ${world.state.wanted}.`);
    if (world.state.over === 'busted') {
      screen = SCREEN_BUSTED;
      audio.busted();
      announce('Busted. The police caught you.');
    } else if (world.state.over === 'down') {
      screen = SCREEN_DOWN;
      audio.busted();
      announce('Knocked out. You wake up at the hospital.');
    } else if (world.state.over === 'win') {
      screen = SCREEN_WIN;
      audio.mission();
      announce('King of Palmara. You finished all six missions.');
    }
    computePrompt();
    const car = world.player.car;
    audio.engine(car ? car.speed : 0, !world.player.onFoot && Boolean(car));
    audio.siren(world.state.wanted > 0);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // One-shot presses are taken once per frame and shared by the screens and the sim.
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.setCamera(world.state.camera);
    renderer.draw(world, screen, best);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Palmara Heat. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
