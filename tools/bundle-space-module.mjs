import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moduleDir = path.resolve(__dirname, '../modules/space_exploration');
const srcDir = path.join(moduleDir, 'src');

const files = [
  path.join(srcDir, 'audio/space_audio.js'),
  path.join(srcDir, 'ship/procedural_textures.js'),
  path.join(srcDir, 'shaders/sun_shader.js'),
  path.join(srcDir, 'shaders/planet_shader.js'),
  path.join(srcDir, 'shaders/ring_shader.js'),
  path.join(srcDir, 'shaders/atmosphere_shader.js'),
  path.join(srcDir, 'shaders/black_hole_shader.js'),
  path.join(srcDir, 'shaders/engine_plasma_shader.js'),
  path.join(srcDir, 'shaders/tactical_grid_shader.js'),
  path.join(srcDir, 'celestial/mass_relay_mesh.js'),
  path.join(srcDir, 'celestial/jump_gate_mesh.js'),
  path.join(srcDir, 'celestial/station_mesh.js'),
  path.join(srcDir, 'celestial/derelict_mesh.js'),
  path.join(srcDir, 'celestial/asteroid_field_mesh.js'),
  path.join(srcDir, 'ship/nexus_armored_dreadnought.js'),
  path.join(srcDir, 'core/flight_physics.js'),
  path.join(srcDir, 'core/three_space_engine.js'),
  path.join(srcDir, 'systems/galaxy_data.js'),
  path.join(srcDir, 'systems/planetary_survey.js'),
  path.join(srcDir, 'ui/space_hud.js')
];

let concatenated = `/* MASSFRONT Space Exploration Module Bundle (AAA Planet Relief, Veins & Jump Gates) */\n(function(){\n'use strict';\n`;

for (const f of files) {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/export\s+class\s+/g, 'class ');
  content = content.replace(/export\s+const\s+/g, 'const ');
  content = content.replace(/import\s+.*?;\n?/g, '');
  concatenated += `\n// --- File: ${path.relative(moduleDir, f)} ---\n` + content + `\n`;
}

// Add Three.js runtime logic
const mainLogic = `
// Expose Galaxy Data to Window
window.GALAXY_DATA = GALAXY_DATA;

// Initialize Audio Subsystem
const audio = new SpaceAudio();

function showToast(msg) {
  const t = document.getElementById('toastBanner');
  if (t) {
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 2400);
  }
}

// Persistent Player State
const playerState = {
  credits: 2470,
  exp: 28,
  fuel: 1000,
  maxFuel: 1000,
  probes: 12,
  eezo: 0,
  platinum: 0,
  activeCommander: 'Archangel',
  recruited: { archangel: true, professor: false, veteran: false }
};

function updateHeaderStats() {
  const fuelPct = Math.round((playerState.fuel / playerState.maxFuel) * 100);
  const fuelEl = document.getElementById('statFuelVal');
  if (fuelEl) fuelEl.textContent = fuelPct + '%';
  const crEl = document.getElementById('statCrVal');
  if (crEl) crEl.textContent = playerState.credits.toLocaleString();
  const expEl = document.getElementById('statExpVal');
  if (expEl) expEl.textContent = playerState.exp;
}

// Three.js Space Engine & Survey Globe
const moduleFrame = document.getElementById('moduleFrame');
const surveyBox = document.querySelector('.survey-viewport-box');
const threeEngine = new ThreeSpaceEngine(moduleFrame);
const physics = new FlightPhysics();
const survey = new PlanetarySurvey(surveyBox, function(type, amount) {
  playerState[type] = (playerState[type] || 0) + amount;
  playerState.exp += 5;
  updateHeaderStats();
});

let currentSysKey = 'sahrabarik';
let currentSystem = GALAXY_DATA.sahrabarik;
let targetObj = null;

const cam = { yaw: 0, pitch: 0.1, dist: 165, fov: 40 };
const touchCam = { dragging: false, lastX: 0, lastY: 0 };

const hud = new SpaceHud(moduleFrame, function(tgt) {
  selectTarget(tgt);
});

function selectTarget(tgt) {
  targetObj = tgt;
  hud.setTargetInfo(tgt, physics.ship);
  audio.play('click');
}
window.selectTarget = selectTarget;

function loadSystem(sysKey) {
  currentSysKey = sysKey;
  currentSystem = GALAXY_DATA[sysKey] || GALAXY_DATA.sahrabarik;

  document.getElementById('crumbCluster').textContent = currentSystem.cluster;
  document.getElementById('crumbSystem').textContent = currentSystem.name;
  document.getElementById('crumbThreat').textContent = currentSystem.security;

  // Position ship in system
  physics.ship.x = 0; physics.ship.y = 0; physics.ship.z = 180;
  physics.ship.yaw = Math.PI; physics.ship.pitch = 0;
  physics.ship.speed = 0; physics.ship.throttle = 0;
  cam.yaw = Math.PI; cam.pitch = 0.1;

  if (currentSystem.planets) {
    currentSystem.planets.forEach(function(p) {
      p.x = Math.cos(p.orbitAngle) * p.orbitDist;
      p.y = 0;
      p.z = Math.sin(p.orbitAngle) * p.orbitDist;
    });
  }

  if (currentSystem.contacts) {
    currentSystem.contacts.forEach(function(c) {
      c.x = Math.cos(c.angle) * c.dist;
      c.y = 0;
      c.z = Math.sin(c.angle) * c.dist;
    });
  }

  threeEngine.loadSystemBodies(currentSystem);

  playerState.fuel = Math.max(50, playerState.fuel - 100);
  updateHeaderStats();
  showToast('TRANSIT COMPLETE: ' + currentSystem.name);
}

// Joystick touch
const stickZone = document.getElementById('flightStickZone');
const stickKnob = document.getElementById('stickKnob');

function handleStick(clientX, clientY) {
  const rect = stickZone.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  let dx = (clientX - cx) / (rect.width / 2), dy = (clientY - cy) / (rect.height / 2);
  const dist = Math.hypot(dx, dy);
  if (dist > 1) { dx /= dist; dy /= dist; }
  physics.setJoystick(true, dx, dy);
  stickKnob.style.transform = 'translate(' + (dx * 26) + 'px, ' + (dy * 26) + 'px)';
}

stickZone.addEventListener('pointerdown', function(ev) {
  ev.stopPropagation(); stickZone.setPointerCapture(ev.pointerId);
  handleStick(ev.clientX, ev.clientY);
});
stickZone.addEventListener('pointermove', function(ev) {
  if (physics.stick.active) handleStick(ev.clientX, ev.clientY);
});
stickZone.addEventListener('pointerup', function() {
  physics.setJoystick(false, 0, 0);
  stickKnob.style.transform = 'translate(0, 0)';
});

// Throttle touch
const throttleZone = document.getElementById('flightThrottleZone');
const throttleFill = document.getElementById('throttleFill');
const throttleHandle = document.getElementById('throttleHandle');
let throttleDrag = false;

function updateThrottleUI(val) {
  physics.setThrottle(val);
  const pct = physics.ship.throttle * 100;
  throttleFill.style.height = pct + '%';
  throttleHandle.style.bottom = pct + '%';
  audio.updateEnginePitch(physics.ship.throttle, physics.ship.speed);
}

function handleThrottle(clientY) {
  const rect = document.getElementById('throttleTrack').getBoundingClientRect();
  const pos = (rect.bottom - clientY) / rect.height;
  updateThrottleUI(pos);
}

throttleZone.addEventListener('pointerdown', function(ev) {
  ev.stopPropagation(); throttleDrag = true;
  throttleZone.setPointerCapture(ev.pointerId);
  handleThrottle(ev.clientY);
});
throttleZone.addEventListener('pointermove', function(ev) {
  if (throttleDrag) handleThrottle(ev.clientY);
});
throttleZone.addEventListener('pointerup', function() { throttleDrag = false; });

// Keyboard controls
window.addEventListener('keydown', function(ev) {
  const k = ev.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') updateThrottleUI(physics.ship.throttle + 0.15);
  if (k === 's' || k === 'arrowdown') updateThrottleUI(physics.ship.throttle - 0.15);
  if (k === 'a' || k === 'arrowleft') physics.ship.yaw -= 0.08;
  if (k === 'd' || k === 'arrowright') physics.ship.yaw += 0.08;
  if (k === ' ') { physics.stop(); updateThrottleUI(0); showToast('FULL STOP'); }
});

// Canvas Camera Drag
const threeDom = threeEngine.renderer.domElement;
threeDom.addEventListener('pointerdown', function(ev) {
  touchCam.dragging = true; touchCam.lastX = ev.clientX; touchCam.lastY = ev.clientY;
  audio.init();
});
window.addEventListener('pointermove', function(ev) {
  if (touchCam.dragging) {
    const dx = ev.clientX - touchCam.lastX, dy = ev.clientY - touchCam.lastY;
    touchCam.lastX = ev.clientX; touchCam.lastY = ev.clientY;
    cam.yaw -= dx * 0.005;
    cam.pitch = Math.max(-0.8, Math.min(0.8, cam.pitch + dy * 0.005));
  }
});
window.addEventListener('pointerup', function() { touchCam.dragging = false; });

// Action Buttons
document.getElementById('actAlign').onclick = function() {
  if (targetObj) {
    physics.alignTo(targetObj.x, targetObj.y, targetObj.z);
    showToast('NEXUS-VII INTERCEPT VECTOR ALIGNED');
    audio.play('click');
  }
};
document.getElementById('actWarp').onclick = function() {
  if (targetObj) {
    physics.startWarp(targetObj);
    showToast('WARP DRIVE COILS ENGAGED');
    audio.play('warp');
  }
};
document.getElementById('actSurvey').onclick = function() {
  const p = targetObj && targetObj.isPlanet ? targetObj : (currentSystem.planets ? currentSystem.planets[0] : null);
  if (p) {
    survey.open(p);
    document.getElementById('surveyModal').classList.add('active');
    document.getElementById('surveyModalTitle').textContent = p.name + ' · ' + (p.sub || 'ORBITAL SURVEY');
    audio.play('scan');
  }
};
document.getElementById('btnCloseSurvey').onclick = function() {
  survey.close();
  document.getElementById('surveyModal').classList.remove('active');
  audio.play('click');
};
document.getElementById('btnSurveyLaunchProbe').onclick = function() {
  const res = survey.launchProbe();
  if (res) {
    audio.play('probe');
    showToast('PROBE IMPACT: +' + res.amount + ' ' + res.type.toUpperCase());
    document.getElementById('survPctVal').textContent = survey.surveyPct + '%';
    document.getElementById('survSigVal').textContent = survey.signalPct + '%';
    document.getElementById('survProbesVal').textContent = survey.probesCount + ' (1/3 SITES)';
  } else {
    showToast('NO PROBES REMAINING — DOCK AT FUEL DEPOT');
  }
};

// Interact Button
document.getElementById('actDeploy').onclick = function() {
  if (!targetObj) {
    showToast('SELECT A TARGET OR WORLD TO INTERACT');
    return;
  }

  if (targetObj.id === 'omega_station') {
    openRecruitmentModal();
  } else if (targetObj.id === 'fuel_depot') {
    openFuelModal();
  } else if (targetObj.mission || targetObj.isPlanet) {
    openTacticalModal(targetObj.mission || { title: targetObj.name + ' TACTICAL INSERTION', enemy: 'Brood Outpost Cell', reward: '1,000 CR + 400 EXP' });
  } else {
    showToast('TARGET: ' + targetObj.name + ' (NO ACTIVE CONTRACT)');
  }
};

// Omega Recruitment Modal
function openRecruitmentModal() {
  const c = document.getElementById('recruitCardsContainer');
  const recruits = GALAXY_DATA.sahrabarik.contacts[0].recruits;
  let html = '';
  recruits.forEach(function(r) {
    const isHired = playerState.recruited[r.id];
    html += \`
      <div class="recruit-card">
        <div class="recruit-head">
          <b>\${r.name}</b>
          <span>\${r.cost}</span>
        </div>
        <div style="font-family:var(--font-heading);font-size:8px;color:var(--neon-cyan);">\${r.role}</div>
        <div class="recruit-quote">"\${r.quote}"</div>
        <button type="button" class="dev-btn \${isHired ? 'hired' : ''}" style="margin-top:6px;width:100%;" onclick="window.hireRecruit('\${r.id}', '\${r.name}', \${parseInt(r.cost)})\">
          \${isHired ? '✓ ACTIVE IN STRIKE MATRIX' : 'RECRUIT COMMANDER'}
        </button>
      </div>
    \`;
  });
  c.innerHTML = html;
  document.getElementById('recruitModal').classList.add('active');
  audio.play('click');
}

window.hireRecruit = function(id, name, cost) {
  if (playerState.recruited[id]) {
    showToast(name + ' IS ALREADY DEPLOYED');
    return;
  }
  if (playerState.credits < cost) {
    showToast('INSUFFICIENT CREDITS (NEED ' + cost + ' CR)');
    return;
  }
  playerState.credits -= cost;
  playerState.recruited[id] = true;
  playerState.activeCommander = name;
  updateHeaderStats();
  audio.play('recruit');
  showToast(name.toUpperCase() + ' JOINED COMMAND MATRIX!');
  openRecruitmentModal();
};

document.getElementById('btnCloseRecruit').onclick = function() {
  document.getElementById('recruitModal').classList.remove('active');
  audio.play('click');
};

// Fuel Modal
function openFuelModal() {
  document.getElementById('fuelTankStatus').textContent = Math.round((playerState.fuel / playerState.maxFuel) * 100) + '% (' + playerState.fuel + ' / ' + playerState.maxFuel + ' L)';
  document.getElementById('probeBayStatus').textContent = survey.probesCount + ' PROBES LOADED';
  document.getElementById('fuelModal').classList.add('active');
  audio.play('click');
}

document.getElementById('btnBuyFuel').onclick = function() {
  if (playerState.credits >= 100) {
    playerState.credits -= 100;
    playerState.fuel = Math.min(playerState.maxFuel, playerState.fuel + 500);
    updateHeaderStats();
    openFuelModal();
    audio.play('fuel');
    showToast('HELIUM-3 FUEL TANKS REPLENISHED');
  } else {
    showToast('INSUFFICIENT CREDITS');
  }
};

document.getElementById('btnBuyProbes').onclick = function() {
  if (playerState.credits >= 150) {
    playerState.credits -= 150;
    survey.probesCount += 5;
    updateHeaderStats();
    openFuelModal();
    audio.play('fuel');
    showToast('SURVEY PROBES RESTOCKED');
  } else {
    showToast('INSUFFICIENT CREDITS');
  }
};

document.getElementById('btnCloseFuel').onclick = function() {
  document.getElementById('fuelModal').classList.remove('active');
  audio.play('click');
};

// Tactical Strike Modal
function openTacticalModal(mission) {
  document.getElementById('dossierMissionName').textContent = mission.title;
  document.getElementById('dossierThreat').textContent = mission.enemy || 'BROOD THREAT';
  document.getElementById('dossierReward').textContent = mission.reward || '1,000 CR';
  document.getElementById('dossierCommander').textContent = playerState.activeCommander;
  document.getElementById('tacticalModal').classList.add('active');
  audio.play('hazard');
}

document.getElementById('btnCloseTactical').onclick = function() {
  document.getElementById('tacticalModal').classList.remove('active');
  audio.play('click');
};

document.getElementById('btnLaunchTacticalDropship').onclick = function() {
  audio.play('warp');
  showToast('DROPSHIP LAUNCHED — COMMENCING RTS COMBAT DEPLOYMENT');
  playerState.credits += 1200;
  playerState.exp += 35;
  updateHeaderStats();
  setTimeout(function() {
    document.getElementById('tacticalModal').classList.remove('active');
    showToast('OPERATION RESOLVED: VICTORY! (+1,200 CR / +35 EXP)');
    audio.play('recruit');
  }, 1200);
};

document.getElementById('btnEnterPlanetSurface').onclick = function() {
  survey.close();
  document.getElementById('surveyModal').classList.remove('active');
  openTacticalModal({ title: (survey.planet ? survey.planet.name : 'AURELIA II') + ' SURFACE PURGE', enemy: 'Brood Stage 2 Spire Hive', reward: '1,500 CR + 600 EEZO' });
};

// Galaxy Map Modal
document.getElementById('btnGalaxyMap').onclick = function() {
  document.getElementById('galaxyModal').classList.add('active');
  audio.play('click');
};
document.getElementById('btnCloseGalaxy').onclick = function() {
  document.getElementById('galaxyModal').classList.remove('active');
  audio.play('click');
};
document.querySelectorAll('.galaxy-card').forEach(function(card) {
  card.onclick = function() {
    loadSystem(card.dataset.sys);
    document.getElementById('galaxyModal').classList.remove('active');
    audio.play('warp');
  };
});

// Fullscreen Toggle
document.getElementById('btnToggleFullscreen').onclick = function() {
  const f = document.getElementById('moduleFrame');
  f.classList.toggle('fullscreen');
  setTimeout(function() {
    threeEngine.resize(f.clientWidth || window.innerWidth, f.clientHeight || window.innerHeight);
  }, 100);
};

// Main Three.js Animation Loop
let lastT = 0;
function loop(t) {
  if (!lastT) lastT = t;
  let dt = (t - lastT) / 1000; lastT = t;
  if (dt > 0.1) dt = 0.1;

  physics.update(dt);
  survey.update(dt);

  // Fuel consumption
  if (physics.ship.speed > 5) {
    playerState.fuel = Math.max(0, playerState.fuel - dt * (physics.ship.warpState > 0 ? 8 : 1.5));
    updateHeaderStats();
  }

  // Planetary Keplerian Orbit Updates
  if (currentSystem.planets) {
    currentSystem.planets.forEach(function(p) {
      p.orbitAngle += p.orbitSpeed * dt * 60;
      p.x = Math.cos(p.orbitAngle) * p.orbitDist;
      p.y = 0;
      p.z = Math.sin(p.orbitAngle) * p.orbitDist;
      if (p._threeMesh) p._threeMesh.position.set(p.x, 0, p.z);
    });
  }

  // Camera Chase (Smooth Overhead Perspective Follow)
  const sh = physics.ship;
  cam.dist = cam.dist + ((sh.warpState > 0 ? 220 : 180) - cam.dist) * (dt * 3);
  cam.yaw = cam.yaw + (sh.yaw - cam.yaw) * (dt * 3.5);

  // Update Three.js 3D Scene
  threeEngine.update(dt, t, sh, cam);

  // HUD Callouts & Telemetry
  hud.updateCallouts(currentSystem, threeEngine, sh);
  if (targetObj) hud.setTargetInfo(targetObj, sh);

  document.getElementById('telemSpeed').textContent = Math.round(sh.speed * 6) + ' m/s';
  const hdg = Math.round(((sh.yaw * 180 / Math.PI) % 360 + 360) % 360);
  const hdgEl = document.getElementById('telemHeading');
  if (hdgEl) hdgEl.textContent = String(hdg).padStart(3, '0') + '°';

  requestAnimationFrame(loop);
}

loadSystem('sahrabarik');
updateThrottleUI(0);
updateHeaderStats();
requestAnimationFrame(loop);
`;

concatenated += mainLogic + `\n})();\n`;

const outDir = path.join(moduleDir, 'dist');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'space_module.bundle.js');
fs.writeFileSync(outFile, concatenated, 'utf8');

console.log('Successfully bundled complete Planet Relief & Jump Gate Module ->', outFile);
