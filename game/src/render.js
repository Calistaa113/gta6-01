// Drawing only: the world state in, pixels out. The camera follows the player over
// a 3600x2600 city and the 1280x720 viewport is scaled to fit the window. Everything
// is drawn with layered canvas detail — shadows, roofs with window grids, road
// markings, detailed car sprites — so the city reads at a glance and stays clear.
import {
  CARS, PALETTE, PLAYER, ROADS_X, ROADS_Y, ROAD_W, SEA_X, VIEW, WORLD,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_DOWN = 'down';
export const SCREEN_WIN = 'win';

const MINIMAP_W = 208;
const MINIMAP_H = 150;

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

const GROUND = {
  downtown: '#c9bda6',
  residential: '#b7c48a',
  industrial: '#a8a49a',
  park: '#7fb069',
  beach: '#e8d5a4',
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();
  let minimap = null;

  function font(size, weight) {
    const key = `${weight || 400}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || 400} ${size}px ${'system-ui, -apple-system, "Segoe UI", sans-serif'}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, weight) {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  /** A static top-down picture of the city for the minimap, drawn once. */
  function buildMinimap(city) {
    const off = document.createElement('canvas');
    off.width = MINIMAP_W;
    off.height = MINIMAP_H;
    const c = off.getContext('2d');
    const sx = MINIMAP_W / WORLD.width;
    const sy = MINIMAP_H / WORLD.height;
    c.fillStyle = '#24343c';
    c.fillRect(0, 0, MINIMAP_W, MINIMAP_H);
    for (const b of city.blocks) {
      c.fillStyle = b.district === 'park' ? '#5d8a4c' : b.district === 'downtown' ? '#8a7f6a' : '#6f7a55';
      c.fillRect(b.x0 * sx, b.y0 * sy, b.w * sx, b.h * sy);
    }
    c.fillStyle = '#2fa8a0';
    c.fillRect(SEA_X * sx, 0, (WORLD.width - SEA_X) * sx, MINIMAP_H);
    c.fillStyle = '#e8d5a4';
    c.fillRect(3232 * sx, 0, (SEA_X - 3232) * sx, MINIMAP_H);
    c.strokeStyle = '#c8cdd4';
    c.lineWidth = 1.5;
    for (const rx of ROADS_X) {
      c.beginPath(); c.moveTo(rx * sx, 0); c.lineTo(rx * sx, MINIMAP_H); c.stroke();
    }
    for (const ry of ROADS_Y) {
      c.beginPath(); c.moveTo(0, ry * sy); c.lineTo(MINIMAP_W, ry * sy); c.stroke();
    }
    minimap = off;
  }

  function drawGround(city, time) {
    // Base: sidewalks everywhere, then each block's district ground.
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    for (const b of city.blocks) {
      ctx.fillStyle = GROUND[b.district] || GROUND.residential;
      ctx.fillRect(b.x0, b.y0, b.w, b.h);
      if (b.district === 'park' && b.pond) {
        ctx.fillStyle = '#4aa8c8';
        ctx.beginPath();
        ctx.ellipse(b.pond.x + b.pond.w / 2, b.pond.y + b.pond.h / 2, b.pond.w / 2, b.pond.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#d9c9a3';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(b.x0 + b.w / 2, b.y0);
        ctx.lineTo(b.x0 + b.w / 2, b.y1);
        ctx.moveTo(b.x0, b.y0 + b.h / 2);
        ctx.lineTo(b.x1, b.y0 + b.h / 2);
        ctx.stroke();
      }
    }
    // Beach sand and the sea, with slow waves.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(ROADS_X[ROADS_X.length - 1] + ROAD_W / 2, 0, SEA_X - ROADS_X[ROADS_X.length - 1] - ROAD_W / 2, WORLD.height);
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(SEA_X, 0, WORLD.width - SEA_X, WORLD.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    for (let y = 0; y < WORLD.height; y += 130) {
      const off = Math.sin(time * 0.7 + y * 0.02) * 8;
      ctx.beginPath();
      ctx.moveTo(SEA_X + 6 + off, y + 40);
      ctx.quadraticCurveTo(SEA_X + 34, y + 52, SEA_X + 62 + off, y + 40);
      ctx.stroke();
    }
    // The pier.
    ctx.fillStyle = '#8a6a42';
    ctx.fillRect(city.pier.x, city.pier.y, city.pier.w, city.pier.h);
    ctx.strokeStyle = '#6a4e2e';
    ctx.lineWidth = 2;
    for (let x = city.pier.x + 14; x < city.pier.x + city.pier.w; x += 14) {
      ctx.beginPath(); ctx.moveTo(x, city.pier.y); ctx.lineTo(x, city.pier.y + city.pier.h); ctx.stroke();
    }
    // Roads: asphalt, edge lines, dashed centres, crosswalks.
    ctx.fillStyle = PALETTE.road;
    for (const rx of ROADS_X) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.height);
    for (const ry of ROADS_Y) ctx.fillRect(0, ry - ROAD_W / 2, WORLD.width, ROAD_W);
    ctx.fillStyle = PALETTE.roadEdge;
    for (const rx of ROADS_X) {
      ctx.fillRect(rx - ROAD_W / 2, 0, 3, WORLD.height);
      ctx.fillRect(rx + ROAD_W / 2 - 3, 0, 3, WORLD.height);
    }
    for (const ry of ROADS_Y) {
      ctx.fillRect(0, ry - ROAD_W / 2, WORLD.width, 3);
      ctx.fillRect(0, ry + ROAD_W / 2 - 3, WORLD.width, 3);
    }
    ctx.fillStyle = PALETTE.centreDash;
    for (const rx of ROADS_X) {
      for (let y = 40; y < WORLD.height; y += 90) {
        let inCross = false;
        for (const ry of ROADS_Y) if (Math.abs(y - ry) < ROAD_W) inCross = true;
        if (!inCross) ctx.fillRect(rx - 3, y, 6, 44);
      }
    }
    for (const ry of ROADS_Y) {
      for (let x = 40; x < WORLD.width; x += 90) {
        let inCross = false;
        for (const rx of ROADS_X) if (Math.abs(x - rx) < ROAD_W) inCross = true;
        if (!inCross) ctx.fillRect(x, ry - 3, 44, 6);
      }
    }
    ctx.fillStyle = PALETTE.crosswalk;
    for (const rx of ROADS_X) {
      for (const ry of ROADS_Y) {
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(rx + i * 12 - 4, ry - ROAD_W / 2 + 6, 8, 18);
          ctx.fillRect(rx + i * 12 - 4, ry + ROAD_W / 2 - 24, 8, 18);
        }
      }
    }
  }

  function drawBuildings(city) {
    for (const b of city.buildings) {
      // Soft drop shadow, offset down-right.
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      roundRectPath(ctx, b.x + b.shadow * 0.5, b.y + b.shadow, b.w, b.h, 6);
      ctx.fill();
      // Walls, then the roof inset with its window grid.
      ctx.fillStyle = b.wall;
      roundRectPath(ctx, b.x, b.y, b.w, b.h, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = b.roof;
      roundRectPath(ctx, b.x + 6, b.y + 6, b.w - 12, b.h - 12, 4);
      ctx.fill();
      if (b.type === 'container') {
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        for (let x = b.x + 14; x < b.x + b.w - 6; x += 14) {
          ctx.beginPath(); ctx.moveTo(x, b.y + 6); ctx.lineTo(x, b.y + b.h - 6); ctx.stroke();
        }
        continue;
      }
      const cw = (b.w - 12) / b.winCols;
      const ch = (b.h - 12) / b.winRows;
      for (let c = 0; c < b.winCols; c += 1) {
        for (let r = 0; r < b.winRows; r += 1) {
          const lit = (b.lit >> ((c * b.winRows + r) % 31)) & 1;
          ctx.fillStyle = lit ? '#ffe9a8' : 'rgba(0,0,0,0.28)';
          ctx.fillRect(b.x + 10 + c * cw + cw * 0.22, b.y + 10 + r * ch + ch * 0.22, cw * 0.56, ch * 0.56);
        }
      }
      // A rooftop unit or skylight.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(b.x + b.w - 26, b.y + 10, 14, 10);
    }
  }

  function drawTrees(city) {
    for (const t of city.trees) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(t.x + 5, t.y + 6, t.r * 0.9, t.r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      if (t.kind === 'palm') {
        ctx.strokeStyle = '#7a5a34';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x + t.lean * 30, t.y - 12);
        ctx.stroke();
        ctx.strokeStyle = '#3f7a3a';
        ctx.lineWidth = 3;
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + t.lean;
          ctx.beginPath();
          ctx.moveTo(t.x + t.lean * 30, t.y - 12);
          ctx.quadraticCurveTo(
            t.x + t.lean * 30 + Math.cos(a) * t.r, t.y - 12 + Math.sin(a) * t.r * 0.6,
            t.x + t.lean * 30 + Math.cos(a) * (t.r + 6), t.y - 12 + Math.sin(a) * (t.r + 6) * 0.8,
          );
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#4a7a3f';
        ctx.beginPath(); ctx.arc(t.x - 4, t.y - 4, t.r * 0.62, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(t.x + 5, t.y - 2, t.r * 0.58, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5d9a4c';
        ctx.beginPath(); ctx.arc(t.x, t.y - 7, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7fb069';
        ctx.beginPath(); ctx.arc(t.x - 3, t.y - 10, t.r * 0.3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawCar(car, time) {
    const spec = CARS[car.kind];
    const len = spec.length;
    const wid = spec.width;
    ctx.save();
    ctx.translate(car.x, car.y);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(4, 6, len * 0.52, wid * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(car.angle);
    // Wheels.
    ctx.fillStyle = '#14161a';
    const wy = wid / 2 - 2;
    for (const [wx, wwy] of [[-len * 0.3, -wy], [len * 0.3, -wy], [-len * 0.3, wy], [len * 0.3, wy]]) {
      roundRectPath(ctx, wx - 9, wwy - 5, 18, 10, 3);
      ctx.fill();
    }
    // Body with a lighter top edge.
    ctx.fillStyle = car.body;
    roundRectPath(ctx, -len / 2, -wid / 2, len, wid, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    roundRectPath(ctx, -len / 2 + 3, -wid / 2 + 2, len - 6, 7, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    roundRectPath(ctx, -len / 2, -wid / 2, len, wid, 9);
    ctx.stroke();
    // Cabin and glass.
    const cabLen = car.kind === 'truck' ? len * 0.24 : len * 0.44;
    const cabX = car.kind === 'truck' ? len / 2 - cabLen - 4 : -cabLen / 2 + 2;
    ctx.fillStyle = car.glass;
    roundRectPath(ctx, cabX, -wid / 2 + 5, cabLen, wid - 10, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(cabX + 3, -wid / 2 + 7, cabLen * 0.5, 3);
    if (car.kind === 'truck') {
      // Cargo box with ribs.
      ctx.fillStyle = '#c9c2b2';
      roundRectPath(ctx, -len / 2 + 4, -wid / 2 + 4, len * 0.62, wid - 8, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      for (let x = -len / 2 + 18; x < len * 0.12; x += 16) {
        ctx.beginPath(); ctx.moveTo(x, -wid / 2 + 5); ctx.lineTo(x, wid / 2 - 5); ctx.stroke();
      }
    }
    if (car.kind === 'taxi') {
      // Checkered band and roof sign.
      for (let i = 0; i < 6; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? '#14161a' : '#f5f1e6';
        ctx.fillRect(-len / 2 + 8 + i * 8, -2, 8, 4);
      }
      ctx.fillStyle = '#f5f1e6';
      roundRectPath(ctx, -8, -wid / 2 - 2, 16, 6, 2);
      ctx.fill();
    }
    if (car.kind === 'sports') {
      // Rear spoiler.
      ctx.fillStyle = '#14161a';
      ctx.fillRect(-len / 2 - 3, -wid / 2 + 2, 5, wid - 4);
    }
    if (car.kind === 'police') {
      // White doors and the flashing light bar.
      ctx.fillStyle = '#f5f1e6';
      ctx.fillRect(-6, -wid / 2, 12, wid);
      const phase = Math.floor(time * 4 + car.sirenPhase) % 2 === 0;
      ctx.fillStyle = phase ? '#ff2e2e' : '#2e7dff';
      roundRectPath(ctx, -7, -wid / 2 - 3, 7, 6, 2);
      ctx.fill();
      ctx.fillStyle = phase ? '#2e7dff' : '#ff2e2e';
      roundRectPath(ctx, 0, -wid / 2 - 3, 7, 6, 2);
      ctx.fill();
    }
    // Headlights and taillights.
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath(); ctx.arc(len / 2 - 3, -wid / 2 + 7, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(len / 2 - 3, wid / 2 - 7, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff2e2e';
    ctx.fillRect(-len / 2 + 1, -wid / 2 + 6, 4, 5);
    ctx.fillRect(-len / 2 + 1, wid / 2 - 11, 4, 5);
    if (car.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      roundRectPath(ctx, -len / 2, -wid / 2, len, wid, 9);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPerson(x, y, angle, color, moving, time, armed) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x + 3, y + 4, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
    const bob = moving ? Math.sin(time * 12) * 2 : 0;
    ctx.fillStyle = '#20242c';
    ctx.beginPath(); ctx.arc(x - Math.sin(angle) * 4, y + Math.cos(angle) * 4 + bob, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + Math.sin(angle) * 4, y - Math.cos(angle) * 4 - bob, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e8b48a';
    ctx.beginPath(); ctx.arc(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3, 5.5, 0, Math.PI * 2); ctx.fill();
    if (armed) {
      ctx.strokeStyle = '#14161a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * 10, y + Math.sin(angle) * 10);
      ctx.lineTo(x + Math.cos(angle) * 22, y + Math.sin(angle) * 22);
      ctx.stroke();
    }
  }

  function drawShops(world, time) {
    const city = world.city;
    const pulse = 0.5 + Math.sin(time * 3) * 0.2;
    for (const key of Object.keys(city.shops)) {
      const s = city.shops[key];
      const color = s.kind === 'spray' ? '#2a9d8f' : s.kind === 'arms' ? '#c96f4a' : '#e5534b';
      ctx.strokeStyle = color;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, 30 + Math.sin(time * 3) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(s.x, s.y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      text(s.kind === 'spray' ? 'S' : s.kind === 'arms' ? 'A' : '+', s.x, s.y + 6, 18, '#fff', 'center', 700);
      text(s.name, s.x, s.y - 26, 15, '#fff', 'center', 600);
    }
    // The safehouse.
    const sh = city.places.safehouse;
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath(); ctx.arc(sh.x, sh.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#14161a';
    text('H', sh.x, sh.y + 5, 15, '#14161a', 'center', 700);
    text('Safehouse', sh.x, sh.y - 22, 14, '#fff', 'center', 600);
  }

  function drawPickups(world, time) {
    for (const bag of world.state.bags) {
      if (bag.taken) continue;
      const bob = Math.sin(time * 4 + bag.x) * 3;
      ctx.fillStyle = 'rgba(88,214,141,0.25)';
      ctx.beginPath(); ctx.arc(bag.x, bag.y + bob, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a9d5a';
      ctx.beginPath(); ctx.arc(bag.x, bag.y + bob, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd94d';
      text('$', bag.x, bag.y + bob + 6, 18, '#ffd94d', 'center', 800);
    }
    for (const pk of world.pickups) {
      if (pk.taken) continue;
      const bob = Math.sin(time * 3 + pk.x) * 2;
      if (pk.kind === 'ammo') {
        ctx.fillStyle = '#3a3f47';
        roundRectPath(ctx, pk.x - 12, pk.y - 9 + bob, 24, 18, 3);
        ctx.fill();
        ctx.fillStyle = '#ffd94d';
        ctx.fillRect(pk.x - 7, pk.y - 5 + bob, 3, 10);
        ctx.fillRect(pk.x - 1, pk.y - 5 + bob, 3, 10);
        ctx.fillRect(pk.x + 5, pk.y - 5 + bob, 3, 10);
      } else {
        ctx.fillStyle = '#f5f1e6';
        roundRectPath(ctx, pk.x - 12, pk.y - 12 + bob, 24, 24, 4);
        ctx.fill();
        ctx.fillStyle = '#e5534b';
        ctx.fillRect(pk.x - 3, pk.y - 8 + bob, 6, 16);
        ctx.fillRect(pk.x - 8, pk.y - 3 + bob, 16, 6);
      }
    }
  }

  function drawParticles(world) {
    for (const p of world.particles) {
      const a = 1 - p.life / p.maxLife;
      if (p.kind === 'dust') {
        ctx.fillStyle = `rgba(214,196,150,${0.5 * a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'smoke') {
        ctx.fillStyle = `rgba(90,90,90,${0.45 * a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'spark') {
        ctx.fillStyle = `rgba(255,214,80,${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'flash') {
        ctx.fillStyle = `rgba(255,240,150,${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 12 * a + 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (world.state.tracer) {
      const t = world.state.tracer;
      ctx.strokeStyle = `rgba(255,240,150,${Math.max(0, t.life / 0.08)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
    }
  }

  function drawWaypoint(world) {
    const state = world.state;
    const mission = world.missionTarget ? world.missionTarget() : null;
    if (!mission) return;
    // A floating diamond and light beam over the target itself.
    const bob = Math.sin(state.time * 4) * 6;
    ctx.save();
    ctx.translate(mission.x, mission.y + bob - 46);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.waypoint;
    ctx.fillRect(-11, -11, 22, 22);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-11, -11, 22, 22);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,159,28,0.12)';
    ctx.fillRect(mission.x - 26, mission.y - 90, 52, 90);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    roundRectPath(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,208,107,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawHud(world) {
    const state = world.state;
    const player = world.player;
    // Money and health, top-left.
    panel(18, 14, 210, 74);
    text(`$${state.money}`, 34, 46, 30, PALETTE.money, 'left', 800);
    const hw = 178;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRectPath(ctx, 34, 58, hw, 12, 6);
    ctx.fill();
    ctx.fillStyle = player.hp > 30 ? PALETTE.health : PALETTE.healthLow;
    roundRectPath(ctx, 34, 58, hw * Math.max(0, player.hp / PLAYER.hp), 12, 6);
    ctx.fill();
    // Mission panel, top-centre.
    const mission = world.missionInfo ? world.missionInfo() : null;
    if (mission) {
      const w = 460;
      panel(640 - w / 2, 14, w, 66);
      text(mission.name, 640, 42, 20, PALETTE.banner, 'center', 800);
      let objective = mission.text;
      if (mission.bags) objective += `  (${mission.bags.taken}/${mission.bags.total})`;
      if (mission.timer) objective += `  — ${Math.ceil(mission.timer)}s`;
      text(objective, 640, 66, 16, PALETTE.text, 'center', 500);
    }
    // Wanted stars, top-right, above the minimap.
    const starY = 34;
    for (let i = 0; i < 5; i += 1) {
      const x = 1280 - 24 - (4 - i) * 34;
      ctx.fillStyle = i < state.wanted ? PALETTE.star : PALETTE.starEmpty;
      starPath(ctx, x, starY, 13);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    drawMinimap(world);
    // Speed and car health, bottom-right.
    if (!player.onFoot && player.car) {
      const kmh = Math.round(Math.abs(player.car.speed) * 0.36);
      text(`${kmh}`, 1262, 668, 44, '#fff', 'right', 800);
      text('km/h', 1262, 694, 16, PALETTE.muted, 'right', 600);
      const car = player.car;
      const maxHp = CARS[car.kind].hp;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      roundRectPath(ctx, 1080, 630, 182, 10, 5);
      ctx.fill();
      ctx.fillStyle = car.hp > maxHp * 0.4 ? '#58d68d' : '#e5534b';
      roundRectPath(ctx, 1080, 630, 182 * Math.max(0, car.hp / maxHp), 10, 5);
      ctx.fill();
      text(CARS[car.kind].name, 1080, 622, 14, PALETTE.muted, 'left', 600);
    }
    // Ammo, bottom-left, on foot.
    if (player.onFoot) {
      panel(18, 640, 170, 56);
      text(`${player.ammo} / ${player.reserve}`, 34, 676, 24, '#fff', 'left', 700);
      text(player.reloadTimer > 0 ? 'Reloading…' : 'R reload', 140, 676, 14, PALETTE.muted, 'left', 500);
    }
    // Context prompt, bottom-centre.
    if (state.prompt) {
      const w = ctx.measureText(state.prompt).width + 36;
      panel(640 - w / 2, 648, w, 40);
      text(state.prompt, 640, 675, 18, PALETTE.prompt, 'center', 600);
    }
    // Banner, centre-top.
    if (state.banner) {
      const a = Math.min(1, state.bannerTimer);
      ctx.globalAlpha = a;
      text(state.banner.title, 640, 150, 40, PALETTE.banner, 'center', 800);
      if (state.banner.sub) text(state.banner.sub, 640, 182, 20, '#fff', 'center', 600);
      ctx.globalAlpha = 1;
    }
    // Off-screen waypoint: an arrow at the viewport edge (screen space).
    const target = world.missionTarget ? world.missionTarget() : null;
    if (target) {
      const cam = state.camera;
      const dx = target.x - cam.x;
      const dy = target.y - cam.y;
      if (Math.abs(dx) > 560 || Math.abs(dy) > 300) {
        const a = Math.atan2(dy, dx);
        const ex = 640 + Math.cos(a) * 540;
        const ey = 360 + Math.sin(a) * 280;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(a);
        ctx.fillStyle = PALETTE.waypoint;
        ctx.beginPath();
        ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-10, 12);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        text(`${Math.round(Math.hypot(dx, dy))}m`, ex, ey + 30, 16, PALETTE.waypoint, 'center', 700);
      }
    }
  }

  function drawMinimap(world) {
    const state = world.state;
    if (!minimap) buildMinimap(world.city);
    const x0 = 1280 - MINIMAP_W - 18;
    const y0 = 62;
    ctx.save();
    roundRectPath(ctx, x0, y0, MINIMAP_W, MINIMAP_H, 8);
    ctx.clip();
    ctx.drawImage(minimap, x0, y0);
    const sx = MINIMAP_W / WORLD.width;
    const sy = MINIMAP_H / WORLD.height;
    // Shops.
    for (const key of Object.keys(world.city.shops)) {
      const s = world.city.shops[key];
      ctx.fillStyle = s.kind === 'spray' ? '#2a9d8f' : s.kind === 'arms' ? '#c96f4a' : '#e5534b';
      ctx.fillRect(x0 + s.x * sx - 3, y0 + s.y * sy - 3, 6, 6);
    }
    // Cash bags.
    ctx.fillStyle = '#58d68d';
    for (const bag of state.bags) {
      if (!bag.taken) ctx.fillRect(x0 + bag.x * sx - 2, y0 + bag.y * sy - 2, 4, 4);
    }
    // Police.
    for (const car of world.cars) {
      if (car.driver !== 'police') continue;
      ctx.fillStyle = Math.floor(state.time * 4) % 2 === 0 ? '#ff2e2e' : '#2e7dff';
      ctx.beginPath(); ctx.arc(x0 + car.x * sx, y0 + car.y * sy, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Waypoint.
    const target = world.missionTarget ? world.missionTarget() : null;
    if (target) {
      ctx.fillStyle = PALETTE.waypoint;
      ctx.beginPath(); ctx.arc(x0 + target.x * sx, y0 + target.y * sy, 5, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const px = x0 + world.player.x * sx;
    const py = y0 + world.player.y * sy;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(world.player.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(242,208,107,0.5)';
    ctx.lineWidth = 2;
    roundRectPath(ctx, x0, y0, MINIMAP_W, MINIMAP_H, 8);
    ctx.stroke();
  }

  function drawPanel(title, lines, prompt, accent) {
    const w = 640;
    const h = 150 + lines.length * 36;
    const x = (VIEW.width - w) / 2;
    const y = (VIEW.height - h) / 2;
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = PALETTE.panel;
    roundRectPath(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = accent || PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(title, VIEW.width / 2, y + 72, 46, accent || PALETTE.banner, 'center', 800);
    lines.forEach((line, i) => text(line, VIEW.width / 2, y + 122 + i * 36, 20, PALETTE.muted, 'center', 500));
    if (prompt) text(prompt, VIEW.width / 2, y + h - 34, 22, PALETTE.money, 'center', 700);
  }

  function drawTitle(world, best) {
    const state = world.state;
    // A warm dusk gradient over the living city, then the title.
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    g.addColorStop(0, 'rgba(20,26,32,0.25)');
    g.addColorStop(0.55, 'rgba(20,26,32,0.45)');
    g.addColorStop(1, 'rgba(20,26,32,0.78)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, VIEW.width, 8);
    text('PALMARA HEAT', VIEW.width / 2, 178, 92, '#ffd94d', 'center', 800);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    text('An open-world crime story in the sun-soaked city of Palmara', VIEW.width / 2, 224, 24, '#f5f1e6', 'center', 500);
    text('Missions from Lena pay cash. The cops pay attention.', VIEW.width / 2, 258, 20, PALETTE.muted, 'center', 500);
    const lines = [
      'WASD / arrows — walk and drive    Shift — run',
      'E — steal a car / get out / use a shop    F — punch    Click — shoot    R — reload',
      'P — pause    M — mute',
    ];
    lines.forEach((line, i) => text(line, VIEW.width / 2, 330 + i * 34, 20, '#f5f1e6', 'center', 500));
    const pulse = 0.65 + Math.sin(state.time * 3) * 0.35;
    ctx.globalAlpha = pulse;
    text('Press Enter or click to start', VIEW.width / 2, 486, 28, '#ffd94d', 'center', 700);
    ctx.globalAlpha = 1;
    if (best > 0) text(`Best fortune: $${best}`, VIEW.width / 2, 530, 18, PALETTE.muted, 'center', 500);
  }

  /** Paint one frame: the city, the actors, the effects, then the HUD or a screen. */
  function draw(world, screen, best) {
    const state = world.state;
    const cam = state.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const ox = (cam.shakeX || 0) + (640 - cam.x);
    const oy = (cam.shakeY || 0) + (360 - cam.y);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x + ox * view.scale, view.y + oy * view.scale);
    drawGround(world.city, state.time);
    drawBuildings(world.city);
    drawTrees(world.city);
    drawShops(world, state.time);
    drawPickups(world, state.time);
    // Skid marks lie on the road, under the cars.
    for (const s of world.skids) {
      ctx.strokeStyle = `rgba(20,20,20,${0.4 * (s.life / 4)})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * 12, s.y - Math.sin(s.angle) * 12);
      ctx.lineTo(s.x + Math.cos(s.angle) * 12, s.y + Math.sin(s.angle) * 12);
      ctx.stroke();
    }
    for (const car of world.cars) drawCar(car, state.time);
    for (const ped of world.peds) {
      if (ped.state === 'down') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(ped.x + 3, ped.y + 4, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ped.color;
        ctx.beginPath(); ctx.ellipse(ped.x, ped.y, 12, 7, ped.angle, 0, Math.PI * 2); ctx.fill();
      } else {
        drawPerson(ped.x, ped.y, ped.angle, ped.color, true, state.time, false);
      }
    }
    for (const cop of world.cops) drawPerson(cop.x, cop.y, cop.angle, '#2c4a7a', true, state.time, false);
    const player = world.player;
    if (player.onFoot) {
      drawPerson(player.x, player.y, player.angle, '#ff7a1a', player.moving, state.time, player.ammo >= 0);
    }
    drawParticles(world);
    // No waypoint on the title screen: the run has not started yet.
    if (screen !== SCREEN_TITLE) drawWaypoint(world);
    // Back to screen space for the HUD and screens.
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawTitle(world, best);
      return;
    }
    drawHud(world);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for you.'], 'Press P to resume');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Palmara PD caught up with you.', 'You lose $100 and the heat is off.'], 'Press Enter to continue', '#2e7dff');
    } else if (screen === SCREEN_DOWN) {
      drawPanel('KNOCKED OUT', ['You wake up at the hospital.', 'You lose 10% of your cash and the heat is off.'], 'Press Enter to continue', '#e5534b');
    } else if (screen === SCREEN_WIN) {
      drawPanel('KING OF PALMARA', [`You finished all six missions with $${state.money}.`, 'The city is yours.'], 'Press Enter to keep playing');
    }
  }

  /** Screen pixels (CSS pixels in the window) to world coordinates. */
  function screenToWorld(sx, sy) {
    const cam = currentCamera;
    return {
      x: (sx - view.x) / view.scale - 640 + cam.x,
      y: (sy - view.y) / view.scale - 360 + cam.y,
    };
  }
  let currentCamera = { x: 640, y: 360 };
  function setCamera(cam) {
    currentCamera = cam;
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld, setCamera };
}
