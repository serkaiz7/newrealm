// ============================================================================
// 1. ENGINE CONSTANTS, BUFFERS & MATERIALS
// ============================================================================
const COLS = 160;
const ROWS = 64;
const FOV  = 1.18;

const MAT_SNOW         = 1;
const MAT_WATER        = 2;
const MAT_BRIDGE       = 3;
const MAT_STAIRS       = 4;
const MAT_CASTLE_WALL  = 5;
const MAT_GREEN_GATE   = 6;
const MAT_COURTYARD    = 7;
const MAT_PINE_TREE    = 8;
const MAT_TOWER        = 9;
const MAT_CHAPEL_FLOOR = 10;
const MAT_ALTAR        = 11;
const MAT_BLOOD_FOUNT  = 12;

// Output screen buffer: R=Glyph Code, G=Red, B=Green, A=Blue
const screenBuffer = new Uint8Array(COLS * ROWS * 4);
const depthBuffer  = new Float32Array(COLS);

function setScreenChar(col, row, asciiCode, r, g, b) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
  const idx = (row * COLS + col) * 4;
  screenBuffer[idx + 0] = asciiCode;
  screenBuffer[idx + 1] = r;
  screenBuffer[idx + 2] = g;
  screenBuffer[idx + 3] = b;
}

// Pseudo-random noise for terrain and stars
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ============================================================================
// 2. DAY / NIGHT LIGHTING MODEL
// ============================================================================
let isDayTime = false;
let dayTransition = 0.0; // 0.0 = Full Night, 1.0 = Full Day

const CELESTIAL_YAW   = -Math.PI * 0.65;
const CELESTIAL_PITCH = 0.48;
const CELESTIAL_DIR   = [
  Math.cos(CELESTIAL_PITCH) * Math.cos(CELESTIAL_YAW),
  Math.cos(CELESTIAL_PITCH) * Math.sin(CELESTIAL_YAW),
  Math.sin(CELESTIAL_PITCH)
];

function toggleTimeOfDay() {
  isDayTime = !isDayTime;
  document.getElementById('tod-label').textContent = isDayTime ? 'DAY' : 'NIGHT';
}
document.getElementById('btn-toggle-tod').addEventListener('click', toggleTimeOfDay);

// ============================================================================
// 3. HEIGHTMAP WITH VAULTED ARCH CURVES
// ============================================================================
const MAP_W = 64;
const MAP_H = 64;
const mapGrid = new Array(MAP_W * MAP_H);

function getCell(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || ix >= MAP_W || iy < 0 || iy >= MAP_H) {
    return { floor: 7.0, roof: 0.0, arch: 0.0, mat: MAT_CASTLE_WALL, archAxis: 'X' };
  }
  return mapGrid[iy * MAP_W + ix];
}

for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    const idx = y * MAP_W + x;
    let cell = { floor: 0.0, roof: 999.0, arch: 0.0, mat: MAT_SNOW, archAxis: 'X' };

    // 1. Water Moat
    if (y >= 34 && y <= 40) {
      cell.floor = -0.9;
      cell.mat = MAT_WATER;
    }

    // 2. Timber Bridge
    if (x >= 29 && x <= 34 && y >= 33 && y <= 41) {
      cell.floor = 0.35;
      cell.roof = 999.0;
      cell.mat = MAT_BRIDGE;
    }

    // 3. Dark Stone Stairs
    if (x >= 29 && x <= 34 && y >= 23 && y <= 32) {
      const stepIndex = 32 - y;
      cell.floor = 0.35 + (stepIndex + 1) * 0.22;
      cell.mat = MAT_STAIRS;
    }

    // 4. Stone Fortress Wall
    if (y === 22 && x >= 8 && x <= 55) {
      cell.floor = 6.2;
      cell.roof = 0.0;
      cell.mat = MAT_CASTLE_WALL;
    }

    // Bastions and Corner Watchtowers
    if ((x >= 24 && x <= 27 && y >= 20 && y <= 22) ||
        (x >= 36 && x <= 39 && y >= 20 && y <= 22) ||
        (x >= 8  && x <= 12 && y >= 20 && y <= 24) ||
        (x >= 51 && x <= 55 && y >= 20 && y <= 24) ||
        (x >= 8  && x <= 12 && y >= 4  && y <= 8)  ||
        (x >= 51 && x <= 55 && y >= 4  && y <= 8)) {
      cell.floor = 7.8;
      cell.roof = 0.0;
      cell.mat = MAT_TOWER;
    }

    // 5. Arched Green Gate
    if (x >= 29 && x <= 34 && (y === 22 || y === 21)) {
      cell.floor = 2.55;
      cell.roof = 5.2;
      cell.arch = 1.45; // Arch curve amplitude
      cell.archAxis = 'X';
      cell.mat = (y === 22) ? MAT_GREEN_GATE : MAT_COURTYARD;
    }

    // 6. Courtyard, Desecrated Chapel, & Blood Fountain
    if (y >= 5 && y <= 20 && x >= 13 && x <= 50) {
      cell.floor = 2.55;
      cell.mat = MAT_COURTYARD;

      if (y >= 6 && y <= 14 && x >= 26 && x <= 37) {
        cell.mat = MAT_CHAPEL_FLOOR;
        if (x >= 30 && x <= 33 && y >= 7 && y <= 8) {
          cell.floor = 3.3;
          cell.mat = MAT_ALTAR;
        }
      }

      if (x >= 42 && x <= 45 && y >= 12 && y <= 15) {
        cell.floor = 2.8;
        cell.mat = MAT_BLOOD_FOUNT;
      }
    }

    // Chapel Columns
    if ((x === 25 || x === 38) && (y >= 8 && y <= 15)) {
      cell.floor = 6.2;
      cell.roof = 0.0;
      cell.mat = MAT_CASTLE_WALL;
    }

    mapGrid[idx] = cell;
  }
}

// Pine Trees Distribution
const pineSeeds = [
  {x: 18, y: 46}, {x: 14, y: 50}, {x: 22, y: 52}, {x: 26, y: 47},
  {x: 37, y: 46}, {x: 42, y: 51}, {x: 47, y: 48}, {x: 52, y: 54},
  {x: 12, y: 58}, {x: 20, y: 60}, {x: 31, y: 57}, {x: 40, y: 61},
  {x: 48, y: 58}, {x: 55, y: 44}, {x: 9,  y: 45}, {x: 16, y: 43},
  {x: 46, y: 43}, {x: 21, y: 38}, {x: 42, y: 38}, {x: 11, y: 36},
  {x: 52, y: 36}, {x: 16, y: 28}, {x: 21, y: 26}, {x: 42, y: 26},
  {x: 48, y: 28}, {x: 7,  y: 30}, {x: 56, y: 30}
];
pineSeeds.forEach(p => {
  const c = getCell(p.x, p.y);
  if (c.mat === MAT_SNOW) c.mat = MAT_PINE_TREE;
});

// ============================================================================
// 4. LIVING NPCS & BEHAVIOR TREES
// ============================================================================
const actors = [
  {
    id: 'valak',
    name: 'VALAK (UNHOLY NUN)',
    type: 'NUN',
    x: 31.5, y: 11.5, z: 2.55,
    speed: 1.15,
    state: 'PATROL',
    timer: 0,
    hoverPhase: 0,
    patrolRoute: [{x: 31.5, y: 11.5}, {x: 31.5, y: 18.0}, {x: 35.0, y: 13.0}, {x: 28.0, y: 13.0}],
    targetIdx: 0,
    actionText: 'HOVERING IN CHAPEL'
  },
  {
    id: 'felix',
    name: 'FELIX (PHANTOM FELINE)',
    type: 'CAT',
    x: 31.5, y: 36.5, z: 0.35,
    speed: 1.9,
    state: 'PROWL',
    timer: 0,
    patrolRoute: [{x: 31.5, y: 34.0}, {x: 31.5, y: 40.5}, {x: 27.5, y: 36.5}, {x: 35.5, y: 36.5}],
    targetIdx: 0,
    actionText: 'PROWLING TIMBER BRIDGE'
  },
  {
    id: 'user1',
    name: 'USER-1 (YOUTHFUL BLOGGER)',
    type: 'STREAMER',
    x: 31.5, y: 25.5, z: 2.2,
    speed: 1.35,
    state: 'STREAMING',
    timer: 0,
    patrolRoute: [{x: 31.5, y: 24.5}, {x: 31.5, y: 28.5}, {x: 33.5, y: 26.5}],
    targetIdx: 0,
    actionText: 'BROADCASTING AT STAIRS'
  }
];

function updateActors(dt) {
  actors.forEach(actor => {
    actor.timer += dt;

    if (actor.type === 'NUN') {
      actor.hoverPhase += dt * 3.2;
      actor.z = 2.55 + Math.sin(actor.hoverPhase) * 0.28;

      if (actor.state === 'PATROL') {
        const target = actor.patrolRoute[actor.targetIdx];
        const dx = target.x - actor.x, dy = target.y - actor.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 0.3) {
          actor.state = 'CASTING';
          actor.timer = 0;
          actor.actionText = 'CASTING: SHADOW WALK [7 MP]';
          actor.targetIdx = (actor.targetIdx + 1) % actor.patrolRoute.length;
        } else {
          actor.x += (dx / dist) * actor.speed * dt;
          actor.y += (dy / dist) * actor.speed * dt;
          actor.actionText = 'GLIDING TOWARD SANCTUARY';
        }
      } else if (actor.state === 'CASTING') {
        if (actor.timer > 3.0) {
          actor.state = 'ATTACKING';
          actor.timer = 0;
          actor.actionText = 'BRANDISHING SPECTRAL SCYTHE';
        }
      } else if (actor.state === 'ATTACKING') {
        if (actor.timer > 2.5) {
          actor.state = 'PATROL';
          actor.timer = 0;
        }
      }
    } else if (actor.type === 'CAT') {
      const curCell = getCell(actor.x, actor.y);
      actor.z = curCell.floor + 0.12;

      if (actor.state === 'PROWL') {
        const target = actor.patrolRoute[actor.targetIdx];
        const dx = target.x - actor.x, dy = target.y - actor.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 0.3) {
          actor.state = (Math.random() > 0.5) ? 'POUNCE' : 'HISS';
          actor.timer = 0;
          actor.actionText = (actor.state === 'POUNCE') ? 'POUNCING AT SPECTRAL MIST' : 'SPECTRAL HISS';
          actor.targetIdx = (actor.targetIdx + 1) % actor.patrolRoute.length;
        } else {
          actor.x += (dx / dist) * actor.speed * dt;
          actor.y += (dy / dist) * actor.speed * dt;
          actor.actionText = 'PROWLING SHADOWS';
        }
      } else {
        if (actor.timer > 2.0) {
          actor.state = 'PROWL';
          actor.timer = 0;
        }
      }
    } else if (actor.type === 'STREAMER') {
      const curCell = getCell(actor.x, actor.y);
      actor.z = curCell.floor + 0.25;

      if (actor.state === 'STREAMING') {
        if (actor.timer > 4.5) {
          actor.state = 'WALKING';
          actor.timer = 0;
          actor.targetIdx = (actor.targetIdx + 1) % actor.patrolRoute.length;
        }
        actor.actionText = 'STREAMING: "CHAT, LOOK AT THIS WALL!"';
      } else if (actor.state === 'WALKING') {
        const target = actor.patrolRoute[actor.targetIdx];
        const dx = target.x - actor.x, dy = target.y - actor.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 0.25) {
          actor.state = 'STREAMING';
          actor.timer = 0;
        } else {
          actor.x += (dx / dist) * actor.speed * dt;
          actor.y += (dy / dist) * actor.speed * dt;
          actor.actionText = 'SEARCHING FOR WIFI HOTSPOT';
        }
      }
    }
  });

  document.getElementById('tracker-valak').textContent = `• VALAK: ${actors[0].actionText}`;
  document.getElementById('tracker-felix').textContent = `• FELIX: ${actors[1].actionText}`;
  document.getElementById('tracker-user').textContent  = `• USER-1: ${actors[2].actionText}`;
}

// ============================================================================
// 5. PLAYER PHYSICS & CONTROLS
// ============================================================================
const player = {
  x: 31.5,
  y: 47.0,
  z: 1.4,
  vz: 0.0,
  yaw: -Math.PI / 2,
  pitch: 0.04,
  speed: 4.2,
  onGround: true
};

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyT') toggleTimeOfDay();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

const canvas = document.getElementById('glcanvas');
canvas.addEventListener('click', () => {
  if (navigator.maxTouchPoints === 0) canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  const p = document.getElementById('click-prompt');
  p.style.opacity = (document.pointerLockElement === canvas) ? '0' : '1';
});
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas) {
    player.yaw += e.movementX * 0.0024;
    player.pitch -= e.movementY * 0.0024;
    player.pitch = Math.max(-0.75, Math.min(0.75, player.pitch));
  }
});

// Touch Navigation Virtual Buttons
const touchState = {
  forward: false, backward: false, strafeL: false, strafeR: false,
  turnL: false, turnR: false, lookU: false, lookD: false,
  jump: false, sprint: false
};

function bindTouchBtn(id, keyProp) {
  const el = document.getElementById(id);
  const start = (e) => { e.preventDefault(); touchState[keyProp] = true; el.classList.add('active'); };
  const end   = (e) => { e.preventDefault(); touchState[keyProp] = false; el.classList.remove('active'); };
  el.addEventListener('touchstart', start, { passive: false });
  el.addEventListener('touchend',   end,   { passive: false });
  el.addEventListener('mousedown',  start);
  el.addEventListener('mouseup',    end);
  el.addEventListener('mouseleave', end);
}

bindTouchBtn('btn-up',       'forward');
bindTouchBtn('btn-down',     'backward');
bindTouchBtn('btn-strafe-l', 'strafeL');
bindTouchBtn('btn-strafe-r', 'strafeR');
bindTouchBtn('btn-turn-l',   'turnL');
bindTouchBtn('btn-turn-r',   'turnR');
bindTouchBtn('btn-look-up',  'lookU');
bindTouchBtn('btn-look-dn',  'lookD');
bindTouchBtn('btn-jump',     'jump');
bindTouchBtn('btn-sprint',   'sprint');

let touchStartX = 0, touchStartY = 0, isDraggingView = false;
canvas.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isDraggingView = true;
  }
}, { passive: true });

canvas.addEventListener('touchmove', e => {
  if (isDraggingView && e.touches.length === 1) {
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    player.yaw += dx * 0.005;
    player.pitch -= dy * 0.005;
    player.pitch = Math.max(-0.75, Math.min(0.75, player.pitch));
  }
}, { passive: true });
canvas.addEventListener('touchend', () => { isDraggingView = false; });

function updatePlayer(dt) {
  if (keys['ArrowLeft']  || touchState.turnL) player.yaw -= 2.2 * dt;
  if (keys['ArrowRight'] || touchState.turnR) player.yaw += 2.2 * dt;
  if (keys['ArrowUp']    || touchState.lookU) player.pitch = Math.min(0.75, player.pitch + 1.6 * dt);
  if (keys['ArrowDown']  || touchState.lookD) player.pitch = Math.max(-0.75, player.pitch - 1.6 * dt);

  let moveX = 0, moveY = 0;
  if (keys['KeyW'] || touchState.forward)  { moveX += Math.cos(player.yaw); moveY += Math.sin(player.yaw); }
  if (keys['KeyS'] || touchState.backward) { moveX -= Math.cos(player.yaw); moveY -= Math.sin(player.yaw); }
  if (keys['KeyA'] || touchState.strafeL)  { moveX += Math.sin(player.yaw); moveY -= Math.cos(player.yaw); }
  if (keys['KeyD'] || touchState.strafeR)  { moveX -= Math.sin(player.yaw); moveY += Math.cos(player.yaw); }

  const len = Math.hypot(moveX, moveY);
  if (len > 0.001) {
    const isSprint = keys['ShiftLeft'] || touchState.sprint;
    const spd = player.speed * (isSprint ? 1.7 : 1.0) * dt;
    const nx = player.x + (moveX / len) * spd;
    const ny = player.y + (moveY / len) * spd;

    const targetCell = getCell(nx, ny);
    if (targetCell.mat !== MAT_CASTLE_WALL && targetCell.mat !== MAT_TOWER) {
      if (targetCell.floor <= player.z + 0.6) {
        player.x = nx;
        player.y = ny;
      }
    }
  }

  const curCell = getCell(player.x, player.y);
  const targetZ = curCell.floor + 1.35;

  if ((keys['Space'] || touchState.jump) && player.onGround) {
    player.vz = 4.4;
    player.onGround = false;
  }

  player.z += player.vz * dt;
  player.vz -= 9.8 * dt;

  if (player.z <= targetZ) {
    player.z = targetZ;
    player.vz = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }
}

// ============================================================================
// 6. COLUMN RAYCASTER WITH DYNAMIC SUN/MOON & LIGHTING
// ============================================================================
function renderScene(timeSec) {
  const focalLength = (COLS * 0.5) / Math.tan(FOV * 0.5);
  const vFocalLength = focalLength * (ROWS / COLS) * 1.8;

  for (let c = 0; c < COLS; c++) depthBuffer[c] = 999.0;

  for (let col = 0; col < COLS; col++) {
    const screenX = col - COLS * 0.5;
    const rayAngleRel = Math.atan2(screenX, focalLength);
    const rayYaw = player.yaw + rayAngleRel;
    const cosCorr = Math.cos(rayAngleRel);

    const rdx = Math.cos(rayYaw);
    const rdy = Math.sin(rayYaw);

    let yCeil = 0;
    let yFloor = ROWS - 1;
    let t = 0.25;
    const maxDist = 48.0;
    let hitSolid = false;
    let prevFloorH = getCell(player.x, player.y).floor;

    while (t < maxDist && !hitSolid && yCeil <= yFloor) {
      const wx = player.x + rdx * t;
      const wy = player.y + rdy * t;
      const cell = getCell(wx, wy);

      // Arch Profile Evaluation
      let effectiveRoof = cell.roof;
      let archDrop = 0.0;
      if (cell.arch > 0.0 && cell.roof < 900.0) {
        const u = (cell.archAxis === 'X') ? (wx - Math.floor(wx)) : (wy - Math.floor(wy));
        const archShape = Math.sqrt(Math.max(0.0, 1.0 - 4.0 * (u - 0.5) * (u - 0.5)));
        archDrop = cell.arch * (1.0 - archShape);
        effectiveRoof = cell.roof - archDrop;
      }

      const distCorr = t * cosCorr;
      const horizon = ROWS * 0.5 + Math.tan(player.pitch) * vFocalLength;
      const projFloorY = Math.round(horizon - ((cell.floor - player.z) / distCorr) * vFocalLength);
      const projRoofY  = (effectiveRoof >= 900.0) ? -100 : Math.round(horizon - ((effectiveRoof - player.z) / distCorr) * vFocalLength);

      const fog = Math.max(0.15, Math.min(1.0, 1.0 - (t / maxDist)));

      // Render Floors
      if (projFloorY < yFloor) {
        const spanStart = Math.max(0, projFloorY);
        for (let r = yFloor; r >= spanStart; r--) {
          let charCode = 46;
          let cr = 180, cg = 200, cb = 220;

          if (cell.mat === MAT_WATER) {
            const wave = Math.sin(wx * 2.5 + timeSec * 3.5) * Math.cos(wy * 2.5 + timeSec * 2.8);
            charCode = (wave > 0.2) ? 126 : ((wave > -0.2) ? 94 : 61);
            if (dayTransition > 0.5) {
              cr = 70; cg = 160; cb = 240; // Sunlit azure ripples
            } else {
              cr = 30; cg = 90;  cb = 180; // Dark midnight waters
            }
          } else if (cell.mat === MAT_BRIDGE) {
            charCode = (Math.floor(wy * 3.0) % 2 === 0) ? 61 : 35;
            cr = 160; cg = 110; cb = 75;
          } else if (cell.mat === MAT_STAIRS) {
            charCode = (Math.floor(wy * 2.5) % 2 === 0) ? 61 : 45;
            cr = 100; cg = 110; cb = 125;
          } else if (cell.mat === MAT_BLOOD_FOUNT) {
            charCode = 37;
            cr = 220; cg = 25; cb = 40;
          } else if (cell.mat === MAT_ALTAR) {
            charCode = 43;
            cr = 210; cg = 180; cb = 110;
          } else if (cell.mat === MAT_CHAPEL_FLOOR) {
            charCode = 43;
            cr = 130; cg = 140; cb = 160;
          } else if (cell.mat === MAT_COURTYARD) {
            charCode = ((Math.floor(wx) + Math.floor(wy)) % 2 === 0) ? 43 : 46;
            cr = 110; cg = 125; cb = 140;
          } else {
            // Snowy Ground
            const sn = hash2(Math.floor(wx * 4.0), Math.floor(wy * 4.0));
            charCode = (sn > 0.85) ? 42 : ((sn > 0.5) ? 46 : 39);
            if (dayTransition > 0.5) {
              cr = 235; cg = 245; cb = 255; // Brilliant snow under sun
            } else {
              cr = 190; cg = 210; cb = 235; // Lunar snow
            }
          }

          // Daytime brightening multiplier
          const lightMul = (1.0 + 0.3 * dayTransition) * fog;
          setScreenChar(col, r, charCode, Math.min(255, Math.floor(cr * lightMul)), Math.min(255, Math.floor(cg * lightMul)), Math.min(255, Math.floor(cb * lightMul)));
        }
        yFloor = spanStart - 1;
      }

      // Render Roof / Arches
      if (projRoofY > yCeil && cell.roof < 900.0) {
        const spanEnd = Math.min(ROWS - 1, projRoofY);
        for (let r = yCeil; r <= spanEnd; r++) {
          let charCode = (cell.arch > 0.0 && archDrop > 0.5) ? 37 : 61;
          const lightMul = (1.0 + 0.2 * dayTransition) * fog;
          setScreenChar(col, r, charCode, Math.floor(110 * lightMul), Math.floor(125 * lightMul), Math.floor(150 * lightMul));
        }
        yCeil = spanEnd + 1;
      }

      // Risers
      if (cell.floor > prevFloorH + 0.15 && t > 0.6) {
        const prevProjY = Math.round(horizon - ((prevFloorH - player.z) / distCorr) * vFocalLength);
        const rTop = Math.max(yCeil, Math.min(yFloor, projFloorY));
        const rBot = Math.max(yCeil, Math.min(yFloor, prevProjY));
        for (let r = rTop; r <= rBot; r++) {
          setScreenChar(col, r, 35, Math.floor(70 * fog), Math.floor(75 * fog), Math.floor(85 * fog));
        }
      }
      prevFloorH = cell.floor;

      // Walls & Arched Gates
      if (cell.mat === MAT_CASTLE_WALL || cell.mat === MAT_TOWER || cell.mat === MAT_GREEN_GATE) {
        const rWallTop = Math.max(yCeil, Math.min(ROWS - 1, (cell.roof < 900.0 ? projRoofY : 0)));
        const rWallBot = Math.min(yFloor, Math.max(0, projFloorY));

        for (let r = rWallTop; r <= rWallBot; r++) {
          let charCode = 35;
          let cr = 90, cg = 100, cb = 115;

          if (cell.mat === MAT_GREEN_GATE) {
            const bar = Math.floor(wx * 6.0) % 2;
            const hinge = Math.floor(r * 0.3) % 2;
            charCode = (hinge === 0) ? 43 : ((bar === 0) ? 124 : 35);
            cr = (hinge === 0) ? 50 : 35;
            cg = (hinge === 0) ? 60 : 160;
            cb = (hinge === 0) ? 50 : 60;
          } else if (cell.mat === MAT_TOWER) {
            charCode = ((Math.floor(wx * 2.0) + r) % 3 === 0) ? 72 : 37;
            cr = 115; cg = 125; cb = 145;
          } else {
            charCode = ((Math.floor(wx * 2.0) + Math.floor(r * 0.5)) % 2 === 0) ? 35 : 66;
            cr = 85; cg = 95; cb = 110;
          }

          const lightMul = (1.0 + 0.3 * dayTransition) * fog;
          setScreenChar(col, r, charCode, Math.min(255, Math.floor(cr * lightMul)), Math.min(255, Math.floor(cg * lightMul)), Math.min(255, Math.floor(cb * lightMul)));
        }

        depthBuffer[col] = distCorr;
        hitSolid = true;
        break;
      }

      // Snowy Pines
      if (cell.mat === MAT_PINE_TREE) {
        const treeCX = Math.floor(wx) + 0.5;
        const treeCY = Math.floor(wy) + 0.5;
        if (Math.hypot(wx - treeCX, wy - treeCY) < 0.38) {
          const treeH = 3.8;
          const rTreeTop = Math.round(horizon - ((cell.floor + treeH - player.z) / distCorr) * vFocalLength);
          const rTreeBot = Math.min(yFloor, Math.max(0, projFloorY));
          const rTreeStart = Math.max(yCeil, Math.min(ROWS - 1, rTreeTop));

          for (let r = rTreeStart; r <= rTreeBot; r++) {
            const relH = (r - rTreeStart) / Math.max(1, rTreeBot - rTreeStart);
            let charCode = 94;
            let cr = 25, cg = 100, cb = 40;

            if (relH < 0.35) {
              charCode = 42;
              cr = 220; cg = 240; cb = 255;
            } else if (relH > 0.88) {
              charCode = 124;
              cr = 95; cg = 65; cb = 40;
            }

            const lightMul = (1.0 + 0.3 * dayTransition) * fog;
            setScreenChar(col, r, charCode, Math.min(255, Math.floor(cr * lightMul)), Math.min(255, Math.floor(cg * lightMul)), Math.min(255, Math.floor(cb * lightMul)));
          }
        }
      }

      t += (t < 10.0) ? 0.08 : 0.16;
    }

    if (!hitSolid) depthBuffer[col] = maxDist;

    // Sky Dome Rendering (Celestial Body: Sun or Moon)
    for (let r = yCeil; r <= yFloor; r++) {
      const screenY = (ROWS * 0.5 + Math.tan(player.pitch) * vFocalLength) - r;
      const rayPitch = Math.atan2(screenY, vFocalLength);

      const rDirX = Math.cos(rayPitch) * Math.cos(rayYaw);
      const rDirY = Math.cos(rayPitch) * Math.sin(rayYaw);
      const rDirZ = Math.sin(rayPitch);

      const dotCelestial = rDirX * CELESTIAL_DIR[0] + rDirY * CELESTIAL_DIR[1] + rDirZ * CELESTIAL_DIR[2];
      const angDist = Math.acos(Math.max(-1.0, Math.min(1.0, dotCelestial)));

      if (dayTransition > 0.5) {
        // DAYTIME SKY: RADIANT WINTER SUN
        if (angDist < 0.08) {
          setScreenChar(col, r, 64, 255, 255, 200); // Solar disc '@'
        } else if (angDist < 0.22) {
          const halo = (0.22 - angDist) / (0.22 - 0.08);
          setScreenChar(col, r, 42, 255, Math.floor(230 * halo), Math.floor(140 * halo)); // Rays '*'
        } else {
          // Daylight gradient sky
          const skyH = Math.max(0.0, rDirZ);
          const cr = Math.floor(70 + 40 * (1.0 - skyH));
          const cg = Math.floor(130 + 50 * (1.0 - skyH));
          const cb = Math.floor(210 + 35 * (1.0 - skyH));
          setScreenChar(col, r, 32, cr, cg, cb);
        }
      } else {
        // NIGHTTIME SKY: FULL MOON & STARS
        if (angDist < 0.075) {
          const mx = rDirX * 35.0, my = rDirZ * 35.0;
          const crater = Math.sin(mx * 5.0) * Math.cos(my * 5.0) + Math.sin(mx * 2.3);
          const charCode = (crater > 0.4) ? 64 : ((crater > 0.0) ? 37 : ((crater > -0.4) ? 79 : 48));
          setScreenChar(col, r, charCode, 255, 255, 240);
        } else if (angDist < 0.18) {
          const haloT = (0.18 - angDist) / (0.18 - 0.075);
          const charCode = (haloT > 0.5) ? 42 : 43;
          setScreenChar(col, r, charCode, Math.floor(150 * haloT), Math.floor(190 * haloT), Math.floor(235 * haloT));
        } else {
          const starSeed = hash2(Math.floor(rDirX * 180.0), Math.floor(rDirZ * 180.0 + rDirY * 60.0));
          let charCode = 32;
          let cr = 4, cg = 8, cb = 20;

          if (starSeed > 0.985 && rDirZ > 0.01) {
            const twinkle = Math.sin(timeSec * 3.5 + starSeed * 100.0);
            charCode = (twinkle > 0.2) ? 42 : 43;
            cr = 240; cg = 245; cb = 255;
          } else if (starSeed > 0.965 && rDirZ > 0.0) {
            charCode = 46;
            cr = 110; cg = 130; cb = 170;
          }
          setScreenChar(col, r, charCode, cr, cg, cb);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // STEP 2: RENDER ANIMATED ACTOR SPRITES WITH Z-TESTING
  // --------------------------------------------------------------------------
  const sortedActors = [...actors].map(act => {
    const dx = act.x - player.x, dy = act.y - player.y;
    const rx = dx * Math.cos(-player.yaw) - dy * Math.sin(-player.yaw);
    const ry = dx * Math.sin(-player.yaw) + dy * Math.cos(-player.yaw);
    return { actor: act, rx, ry };
  }).filter(item => item.ry > 0.4).sort((a, b) => b.ry - a.ry);

  sortedActors.forEach(({ actor, rx, ry }) => {
    const horizon = ROWS * 0.5 + Math.tan(player.pitch) * vFocalLength;
    const spriteCol = Math.round(COLS * 0.5 + (rx / ry) * focalLength);
    const spriteRow = Math.round(horizon - ((actor.z - player.z) / ry) * vFocalLength);

    const sH = Math.max(4, Math.round((2.2 / ry) * vFocalLength));
    const sW = Math.max(3, Math.round((1.4 / ry) * focalLength));

    let spriteMatrix = [];
    let colorMatrix  = [];

    if (actor.type === 'NUN') {
      if (actor.state === 'ATTACKING') {
        spriteMatrix = ["  (o_o) /", "  / | \\/ ", " (  |  ) ", "  /   \\  "];
      } else {
        spriteMatrix = ["  (0_0)  ", "  / | \\  ", " (  |  ) ", "  /   \\  "];
      }
      colorMatrix = [
        [240, 240, 255],
        [170, 110, 250],
        [40,  40,  55],
        [25,  25,  35]
      ];
    } else if (actor.type === 'CAT') {
      spriteMatrix = [" /\\_/\\ ", "(=^.^=)", "(\")_(\")~"];
      colorMatrix = [
        [140, 235, 255],
        [255, 235, 90],
        [110, 215, 255]
      ];
    } else if (actor.type === 'STREAMER') {
      spriteMatrix = [" [o]   ", " (o.o) ", " /| |\\ ", "  / \\  "];
      colorMatrix = [
        [255, 245, 130],
        [240, 210, 190],
        [90,  130, 200],
        [60,  70,  90]
      ];
    }

    const rowsCount = spriteMatrix.length;
    for (let sy = 0; sy < rowsCount; sy++) {
      const line = spriteMatrix[sy];
      const colsCount = line.length;
      const cRGB = colorMatrix[sy] || [200, 200, 200];

      for (let sx = 0; sx < colsCount; sx++) {
        const char = line.charCodeAt(sx);
        if (char <= 32) continue;

        const targetC = Math.round(spriteCol - (sW * 0.5) + (sx / colsCount) * sW);
        const targetR = Math.round(spriteRow - sH + (sy / rowsCount) * sH);

        if (targetC >= 0 && targetC < COLS && targetR >= 0 && targetR < ROWS) {
          if (ry < depthBuffer[targetC]) {
            setScreenChar(targetC, targetR, char, cRGB[0], cRGB[1], cRGB[2]);
          }
        }
      }
    }
  });
}

// ============================================================================
// 7. WEBGL PIPELINE INITIALIZATION (1 GPU DRAW CALL)
// ============================================================================
const gl = canvas.getContext('webgl', { antialias: false, depth: false });
if (!gl) alert('WebGL not supported');

function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

const program = gl.createProgram();
gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vsSource));
gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fsSource));
gl.linkProgram(program);
gl.useProgram(program);

const quadBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

const posAttr = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(posAttr);
gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

const uScreenTexLoc   = gl.getUniformLocation(program, 'u_screenTex');
const uFontTexLoc     = gl.getUniformLocation(program, 'u_fontTex');
const uGridSizeLoc    = gl.getUniformLocation(program, 'u_gridSize');
const uResolutionLoc  = gl.getUniformLocation(program, 'u_resolution');
const uDayFactorLoc   = gl.getUniformLocation(program, 'u_dayFactor');

const fontAtlasTex = createFontAtlasTexture(gl);
const screenTex    = createScreenTexture(gl, COLS, ROWS);

function updateHUD() {
  document.getElementById('pos-display').textContent =
    `${player.x.toFixed(1)}, ${player.y.toFixed(1)}, ${player.z.toFixed(1)}`;

  let deg = Math.round((player.yaw * 180 / Math.PI) % 360);
  if (deg < 0) deg += 360;
  const dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  document.getElementById('compass-display').textContent = `${dirs[Math.round(deg / 45) % 8]} [${deg}°]`;

  const curCell = getCell(player.x, player.y);
  const names = {
    [MAT_SNOW]: 'SNOWY PINE FOREST',
    [MAT_WATER]: 'RIVER MOAT',
    [MAT_BRIDGE]: 'TIMBER BRIDGE',
    [MAT_STAIRS]: 'DARK STONE STAIRS',
    [MAT_CASTLE_WALL]: 'MANSION OUTER WALL',
    [MAT_GREEN_GATE]: 'THE GREEN GATE ARCH',
    [MAT_COURTYARD]: 'CASTLE COURTYARD',
    [MAT_CHAPEL_FLOOR]: 'DESECRATED CHAPEL',
    [MAT_ALTAR]: 'CURSED OFFERING ALTAR',
    [MAT_BLOOD_FOUNT]: 'BLOOD FOUNTAIN',
    [MAT_TOWER]: 'FORTIFIED BASTION'
  };
  document.getElementById('sector-display').textContent = names[curCell.mat] || 'UNKNOWN';
  document.getElementById('cell-stats').textContent =
    `F: ${curCell.floor.toFixed(1)} | R: ${curCell.roof > 900 ? 'SKY' : curCell.roof.toFixed(1)} | A: ${curCell.arch.toFixed(1)}`;

  let miniStr = '';
  const rangeX = 12, rangeY = 6;
  const px = Math.floor(player.x), py = Math.floor(player.y);

  for (let my = py - rangeY; my <= py + rangeY; my++) {
    for (let mx = px - rangeX; mx <= px + rangeX; mx++) {
      if (mx === px && my === py) {
        miniStr += '@';
      } else {
        const npc = actors.find(a => Math.floor(a.x) === mx && Math.floor(a.y) === my);
        if (npc) {
          miniStr += (npc.type === 'NUN') ? 'V' : ((npc.type === 'CAT') ? 'F' : 'U');
        } else {
          const c = getCell(mx, my);
          if (c.mat === MAT_GREEN_GATE) miniStr += 'G';
          else if (c.mat === MAT_CASTLE_WALL || c.mat === MAT_TOWER) miniStr += '#';
          else if (c.mat === MAT_STAIRS) miniStr += '=';
          else if (c.mat === MAT_BRIDGE) miniStr += '|';
          else if (c.mat === MAT_WATER) miniStr += '~';
          else if (c.mat === MAT_PINE_TREE) miniStr += '^';
          else if (c.mat === MAT_BLOOD_FOUNT) miniStr += '%';
          else if (c.mat === MAT_CHAPEL_FLOOR) miniStr += '+';
          else miniStr += '.';
        }
      }
    }
    miniStr += '\n';
  }
  document.getElementById('minimap').textContent = miniStr;
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ============================================================================
// 8. GAME LOOP (1 GPU DRAW CALL PER FRAME)
// ============================================================================
let lastTime = performance.now();

function frame(now) {
  const dt = Math.min(0.08, (now - lastTime) * 0.001);
  lastTime = now;

  // Smooth Day/Night Transition
  const targetDay = isDayTime ? 1.0 : 0.0;
  dayTransition += (targetDay - dayTransition) * (dt * 3.0);

  updatePlayer(dt);
  updateActors(dt);

  renderScene(now * 0.001);

  // Upload dynamic screen ASCII texture
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, screenTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, COLS, ROWS, gl.RGBA, gl.UNSIGNED_BYTE, screenBuffer);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, fontAtlasTex);

  gl.uniform1i(uScreenTexLoc, 0);
  gl.uniform1i(uFontTexLoc, 1);
  gl.uniform2f(uGridSizeLoc, COLS, ROWS);
  gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
  gl.uniform1f(uDayFactorLoc, dayTransition);

  // Single GPU draw call stamps the entire ASCII world
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  updateHUD();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
