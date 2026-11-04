import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { PlatformAPI, isElectron } from './src/platform.js';

const SAVE_KEY = 'devils_cycling_spare_save_data';

const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const loaderScreen = document.getElementById('loader-screen');

const loadingManager = new THREE.LoadingManager();
loadingManager.onProgress = (_, itemsLoaded, itemsTotal) => {
  const progressPercent = itemsTotal ? Math.round((itemsLoaded / itemsTotal) * 100) : 0;
  if (progressBar) progressBar.style.width = `${progressPercent}%`;
  if (progressText) progressText.textContent = `${progressPercent}%`;
};

loadingManager.onLoad = () => {
  if (renderer) {
    renderer.compile(scene, camera);
  }

  if (loaderScreen) {
    loaderScreen.style.opacity = '0';
    loaderScreen.style.transition = 'opacity 0.5s ease';
    setTimeout(() => {
      loaderScreen.style.display = 'none';
    }, 500);
  }

  console.log('All assets loaded & shaders pre-compiled on GPU.');
};

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const gltfLoader = new GLTFLoader(loadingManager);
gltfLoader.setDRACOLoader(dracoLoader);
const textureLoader = new THREE.TextureLoader(loadingManager);
const audioLoader = new THREE.AudioLoader(loadingManager);

function loadGameProgress() {
  try {
    const savedData = PlatformAPI.loadGame(SAVE_KEY);
    if (savedData) {
      return savedData;
    }
  } catch (e) {
    console.error('Failed to load save data:', e);
  }
  return { maxWave: 1, highScore: 0 };
}

function saveGameProgress(currentWave, score) {
  const existingData = loadGameProgress();

  const updatedData = {
    maxWave: Math.max(existingData.maxWave, currentWave),
    highScore: Math.max(existingData.highScore, score)
  };

  try {
    PlatformAPI.saveGame(SAVE_KEY, updatedData);
    console.log('Game progress saved successfully!', updatedData);
  } catch (e) {
    console.error('Failed to save game data:', e);
  }

  return updatedData;
}

let playerScore = 0;
let gameStats = loadGameProgress();

// Game Start State Flag
let gameStarted = false;

const mainMenu = document.getElementById('main-menu');
const playButton = document.getElementById('play-button');

playButton.addEventListener('click', () => {
  if (gameStarted) return;
  gameStarted = true;

  mainMenu.style.display = 'none';
  initAudio();
  spawnWave(currentWave);

  console.log('Game started! Wave 1 spawned.');
});

// Gamepad State Tracking
let activeGamepadIndex = null;
let lastButtonStates = {};

window.addEventListener('gamepadconnected', (e) => {
  console.log(`Controller connected: ${e.gamepad.id} at index ${e.gamepad.index}`);
  activeGamepadIndex = e.gamepad.index;
});

window.addEventListener('gamepaddisconnected', (e) => {
  console.log(`Controller disconnected from index ${e.gamepad.index}`);
  if (activeGamepadIndex === e.gamepad.index) {
    activeGamepadIndex = null;
  }
});

function isButtonPressed(gamepad, buttonIndex) {
  const isDown = gamepad.buttons[buttonIndex]?.pressed;
  const wasDown = lastButtonStates[buttonIndex];
  lastButtonStates[buttonIndex] = isDown;
  return isDown && !wasDown;
}

// Trigger controller rumble / haptic feedback
function triggerRumble(strongMag = 1.0, weakMag = 0.5, durationMs = 250) {
  if (activeGamepadIndex === null) return;

  const gamepads = navigator.getGamepads();
  const gp = gamepads[activeGamepadIndex];

  if (gp && gp.vibrationActuator) {
    gp.vibrationActuator.playEffect('dual-rumble', {
      startDelay: 0,
      duration: durationMs,
      strongMagnitude: strongMag,
      weakMagnitude: weakMag
    }).catch((err) => {
      console.warn('Haptic feedback not supported or blocked:', err);
    });
  }
}

// Lock-on State
let isLockedOn = false;
let lockTarget = null; // References the boss object when locked

// Initialize Web Audio Context (Browsers require user interaction first)
let audioCtx = null;
let bgMusicStarted = false;
let masterGain = null;
let isAudioEnabled = true;
let ambientPulseTimer = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  if (!bgMusicStarted) {
    startBackgroundMusic();
  }
}

function setMasterAudioEnabled(enabled) {
  isAudioEnabled = enabled;
  if (!audioCtx || !masterGain) return;
  masterGain.gain.setTargetAtTime(enabled ? 1 : 0, audioCtx.currentTime, 0.05);
  const toggle = document.getElementById('audio-toggle');
  if (toggle) toggle.textContent = enabled ? 'Audio: On' : 'Audio: Off';
}

function toggleAudio() {
  initAudio();
  setMasterAudioEnabled(!isAudioEnabled);
}

function playSwordSwish() {
  if (!audioCtx) return;

  const bufferSize = audioCtx.sampleRate * 0.15;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(600, audioCtx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(3500, audioCtx.currentTime + 0.12);
  filter.Q.value = 4;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  noise.start();
}

function playImpactSound() {
  if (!audioCtx || !isAudioEnabled) return;

  const osc = audioCtx.createOscillator();
  const oscGain = audioCtx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(120, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.25);

  oscGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
  oscGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);

  osc.connect(oscGain);
  oscGain.connect(masterGain);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.25);
}

function playShieldBlockSound() {
  if (!audioCtx || !isAudioEnabled) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(180, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(90, audioCtx.currentTime + 0.12);

  gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.12);
}

function playDefeatSting() {
  if (!audioCtx || !isAudioEnabled) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(160, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(44, audioCtx.currentTime + 0.8);

  gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.8);
}

function playCritHitStopSound() {
  if (!audioCtx || !isAudioEnabled) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(220, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(90, audioCtx.currentTime + 0.2);

  gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.2);
}

function playEnemyDeathSound() {
  if (!audioCtx || !isAudioEnabled) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(180, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(32, audioCtx.currentTime + 0.5);

  gain.gain.setValueAtTime(0.22, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.5);
}

let droneOsc1 = null;
let droneOsc2 = null;

function startBackgroundMusic() {
  if (bgMusicStarted || !audioCtx || !masterGain) return;
  bgMusicStarted = true;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(220, audioCtx.currentTime);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.05, audioCtx.currentTime);

  droneOsc1 = audioCtx.createOscillator();
  droneOsc1.type = 'sawtooth';
  droneOsc1.frequency.setValueAtTime(55, audioCtx.currentTime);

  droneOsc2 = audioCtx.createOscillator();
  droneOsc2.type = 'sine';
  droneOsc2.frequency.setValueAtTime(82.41, audioCtx.currentTime);

  droneOsc1.connect(filter);
  droneOsc2.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);

  droneOsc1.start();
  droneOsc2.start();

  ambientPulseTimer = setInterval(() => {
    if (!isAudioEnabled || !audioCtx) return;

    const pulse = audioCtx.createOscillator();
    const pulseGain = audioCtx.createGain();
    const pulseFreq = [110, 130.81, 146.83, 164.81][Math.floor(Math.random() * 4)];

    pulse.type = 'triangle';
    pulse.frequency.setValueAtTime(pulseFreq, audioCtx.currentTime);
    pulseGain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    pulseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.28);

    pulse.connect(pulseGain);
    pulseGain.connect(masterGain);

    pulse.start();
    pulse.stop(audioCtx.currentTime + 0.28);
  }, 1200);
}

// Scene, Camera, Renderer Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a24);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
renderer.compile(scene, camera);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xff4500, 1.2);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// Environment Floor
const floorGeo = new THREE.PlaneGeometry(100, 100);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x22222b });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Array to store all obstacles and walls for collision
const obstacles = [];
const playerBox = new THREE.Box3();

function createObstacle(x, z, width, height, depth, color = 0x444455) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const mat = new THREE.MeshStandardMaterial({ color: color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, height / 2, z);
  scene.add(mesh);

  const box = new THREE.Box3().setFromObject(mesh);
  obstacles.push({ mesh, box });
}

function checkPlayerCollision(targetPosition) {
  playerBox.setFromCenterAndSize(
    new THREE.Vector3(targetPosition.x, 1.25, targetPosition.z),
    new THREE.Vector3(0.8, 2.5, 0.8)
  );

  for (const obs of obstacles) {
    if (playerBox.intersectsBox(obs.box)) {
      return true;
    }
  }

  return false;
}

function collidesWithObstacle(x, z, radius = 0.9) {
  const testBox = new THREE.Box3(
    new THREE.Vector3(x - radius, -2, z - radius),
    new THREE.Vector3(x + radius, 6, z + radius)
  );

  return obstacles.some(({ box }) => testBox.intersectsBox(box));
}

function moveWithCollision(entity, deltaX, deltaZ, radius = 0.9) {
  const nextX = entity.position.x + deltaX;
  if (!collidesWithObstacle(nextX, entity.position.z, radius)) {
    entity.position.x = nextX;
  }

  const nextZ = entity.position.z + deltaZ;
  if (!collidesWithObstacle(entity.position.x, nextZ, radius)) {
    entity.position.z = nextZ;
  }
}

// --- BUILD ARENA BOUNDARIES & PILLARS ---
createObstacle(0, -20, 42, 4, 1);
createObstacle(0, 20, 42, 4, 1);
createObstacle(-21, 0, 1, 4, 40);
createObstacle(21, 0, 1, 4, 40);

createObstacle(-6, -6, 2, 3, 2, 0x666677);
createObstacle(6, -6, 2, 3, 2, 0x666677);
createObstacle(-6, 6, 2, 3, 2, 0x666677);
createObstacle(6, 6, 2, 3, 2, 0x666677);

// Array to store active chests
const chests = [];

function spawnChest(x, z) {
  const chestGeo = new THREE.BoxGeometry(0.8, 0.6, 0.6);
  const chestMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.3 });
  const chestMesh = new THREE.Mesh(chestGeo, chestMat);
  chestMesh.position.set(x, 0.3, z);
  scene.add(chestMesh);

  chests.push({
    mesh: chestMesh,
    collected: false,
    box: new THREE.Box3().setFromObject(chestMesh)
  });
}

spawnChest(-6, -8);
spawnChest(6, -8);

// Player Setup (Kratos-Style Block Prototype)
const playerGroup = new THREE.Group();
const bodyGeo = new THREE.CapsuleGeometry(0.5, 1.5, 4, 8);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.position.y = 1.25;
playerGroup.add(body);
scene.add(playerGroup);

// Signature Weapon (Axe / Blade Prototype)
const weaponGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
const weaponMat = new THREE.MeshStandardMaterial({ color: 0x00ffff });
const weapon = new THREE.Mesh(weaponGeo, weaponMat);
weapon.position.set(0.6, 1.2, 0);
playerGroup.add(weapon);

// Boss State Management
let boss = null;
const bossHud = document.getElementById('boss-hud');
const bossTitle = document.getElementById('boss-title');
const bossHpPhase1 = document.getElementById('boss-hp-phase1');
const bossHpPhase2 = document.getElementById('boss-hp-phase2');

const settingsOverlay = document.getElementById('settings-overlay');
const fullscreenToggle = document.getElementById('fullscreen-toggle');
const qualitySlider = document.getElementById('quality-slider');
const closeSettingsBtn = document.getElementById('close-settings');

let isSettingsOpen = false;

function toggleSettingsMenu() {
  isSettingsOpen = !isSettingsOpen;
  settingsOverlay.style.display = isSettingsOpen ? 'flex' : 'none';
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    toggleSettingsMenu();
  }
});

closeSettingsBtn.addEventListener('click', toggleSettingsMenu);

fullscreenToggle.addEventListener('change', (e) => {
  if (e.target.checked) {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    }
  } else if (document.fullscreenElement) {
    document.exitFullscreen();
  }
});

document.addEventListener('fullscreenchange', () => {
  fullscreenToggle.checked = !!document.fullscreenElement;
});

qualitySlider.addEventListener('input', (e) => {
  const scaleFactor = parseFloat(e.target.value);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, scaleFactor));
  renderer.setSize(window.innerWidth, window.innerHeight);
  console.log(`Graphics quality set to scale factor: ${scaleFactor}`);
});

function updateBossHUD() {
  if (!boss) return;

  const phase1Pct = Math.max(0, (boss.hpPhase1 / boss.maxHpPhase1) * 100);
  const phase2Pct = Math.max(0, (boss.hpPhase2 / boss.maxHpPhase2) * 100);

  if (bossHpPhase1) bossHpPhase1.style.width = `${phase1Pct}%`;
  if (bossHpPhase2) bossHpPhase2.style.width = `${phase2Pct}%`;

  if (boss.phase === 2) {
    if (bossTitle) bossTitle.textContent = 'Demon Overlord: Phase 2';
    if (boss.mat) boss.mat.color.setHex(0xff0033);
  } else {
    if (bossTitle) bossTitle.textContent = 'Demon Overlord';
    if (boss.mat) boss.mat.color.setHex(0x6600cc);
  }
}

function spawnBoss() {
  const bossGroup = new THREE.Group();
  const bossGeo = new THREE.CapsuleGeometry(1.5, 3.5, 4, 8);
  const bossMat = new THREE.MeshStandardMaterial({ color: 0x6600cc, roughness: 0.3 });
  const bossMesh = new THREE.Mesh(bossGeo, bossMat);
  bossMesh.position.y = 3.25;
  bossGroup.add(bossMesh);

  const cleaverGeo = new THREE.BoxGeometry(0.5, 3.0, 0.8);
  const cleaverMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
  const cleaver = new THREE.Mesh(cleaverGeo, cleaverMat);
  cleaver.position.set(1.8, 2.5, 0);
  bossGroup.add(cleaver);

  bossGroup.position.set(0, 0, -14);
  scene.add(bossGroup);

  if (bossHud) bossHud.style.display = 'block';

  boss = {
    group: bossGroup,
    mesh: bossMesh,
    cleaver,
    mat: bossMat,
    phase: 1,
    hpPhase1: 500,
    maxHpPhase1: 500,
    hpPhase2: 500,
    maxHpPhase2: 500,
    state: 'IDLE',
    attackCooldown: false
  };

  updateBossHUD();
}

function updateBossHealth(damage) {
  if (!boss) return;

  if (boss.phase === 1) {
    boss.hpPhase1 = Math.max(0, boss.hpPhase1 - damage);
    if (bossHpPhase1) bossHpPhase1.style.width = `${(boss.hpPhase1 / boss.maxHpPhase1) * 100}%`;

    if (boss.hpPhase1 <= boss.maxHpPhase1 * 0.5) {
      boss.phase = 2;
      boss.mat.color.setHex(0xff0000);
      screenShakeDuration = 25;
      playImpactSound();
      updateBossHUD();
    }
  } else {
    boss.hpPhase2 = Math.max(0, boss.hpPhase2 - damage);
    if (bossHpPhase2) bossHpPhase2.style.width = `${(boss.hpPhase2 / boss.maxHpPhase2) * 100}%`;

    if (boss.hpPhase2 <= 0) {
      scene.remove(boss.group);
      if (bossHud) bossHud.style.display = 'none';
      boss = null;

      if (!bossDefeatAchievementUnlocked) {
        triggerAchievement('ACH_DEFEAT_BOSS');
        bossDefeatAchievementUnlocked = true;
      }

      alert('BOSS DEFEATED!');
    }
  }
}

function executeGroundSlam() {
  if (!boss) return;

  boss.state = 'SLAM';
  boss.mat.color.setHex(0xffff00);

  setTimeout(() => {
    if (!boss) return;
    boss.cleaver.rotation.x = Math.PI / 2;

    const dist = boss.group.position.distanceTo(playerGroup.position);
    if (dist < 4.5 && !isBlocking) {
      updatePlayerHealth(-40);
      triggerRumble(1.0, 0.8, 500);
      screenShakeDuration = 18;
    }

    setTimeout(() => {
      if (!boss) return;
      boss.cleaver.rotation.x = 0;
      boss.mat.color.setHex(boss.phase === 1 ? 0x6600cc : 0xff0000);
      boss.state = 'IDLE';
    }, 1000);
  }, 800);
}

function executeWhirlwindSpin() {
  if (!boss) return;

  boss.state = 'SPIN';
  let spins = 0;

  const spinInterval = setInterval(() => {
    if (!boss) {
      clearInterval(spinInterval);
      return;
    }

    boss.group.rotation.y += 0.4;
    spins++;

    const dist = boss.group.position.distanceTo(playerGroup.position);
    if (dist < 3.5) {
      updatePlayerHealth(-8);
      screenShakeDuration = 4;
    }

    if (spins > 20) {
      clearInterval(spinInterval);
      boss.state = 'IDLE';
    }
  }, 50);
}

function updateBossBehavior() {
  if (!boss || !isPlayerAlive) return;

  if (boss.state !== 'SPIN') {
    boss.group.lookAt(playerGroup.position.x, boss.group.position.y, playerGroup.position.z);
  }

  const distToPlayer = boss.group.position.distanceTo(playerGroup.position);

  if (distToPlayer > 3.5 && boss.state === 'IDLE') {
    const dir = new THREE.Vector3().subVectors(playerGroup.position, boss.group.position).normalize();
    boss.group.position.addScaledVector(dir, boss.phase === 2 ? 0.04 : 0.02);
  }

  if (distToPlayer <= 4.0 && boss.state === 'IDLE' && !boss.attackCooldown) {
    boss.attackCooldown = true;

    if (boss.phase === 1) {
      executeGroundSlam();
    } else {
      Math.random() > 0.5 ? executeGroundSlam() : executeWhirlwindSpin();
    }

    setTimeout(() => {
      if (boss) boss.attackCooldown = false;
    }, 2500);
  }
}

spawnBoss();

// Create Shield Mesh (Visual Indicator attached to Player)
const shieldGeo = new THREE.RingGeometry(0.4, 0.8, 16);
const shieldMat = new THREE.MeshBasicMaterial({ color: 0x00aaff, side: THREE.DoubleSide, transparent: true, opacity: 0 });
const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
shieldMesh.position.set(0, 1.2, 0.6); // Position in front of player body
playerGroup.add(shieldMesh);

// Dynamic Enemy Management
let enemies = [];
let currentWave = 1;
let isWaveTransitioning = false;
const waveDisplay = document.getElementById('wave-display');
const raycaster = new THREE.Raycaster();
const mousePointer = new THREE.Vector2(0, 0);

function getAliveEnemies() {
  return enemies.filter((enemy) => enemy && enemy.group && enemy.health > 0);
}

function spawnWave(waveNumber) {
  isWaveTransitioning = false;
  if (waveDisplay) waveDisplay.innerText = `Wave ${waveNumber}`;

  const enemyCount = waveNumber * 2;

  for (let i = 0; i < enemyCount; i++) {
    const enemyGroup = new THREE.Group();
    const enemyGeo = new THREE.CapsuleGeometry(0.6, 1.5, 4, 8);
    const enemyMat = new THREE.MeshStandardMaterial({ color: 0xff0033 });
    const enemyMesh = new THREE.Mesh(enemyGeo, enemyMat);
    enemyMesh.position.y = 1.25;
    enemyGroup.add(enemyMesh);

    const angle = (i / enemyCount) * Math.PI - Math.PI / 2;
    const radius = 12 + Math.random() * 4;
    enemyGroup.position.set(Math.sin(angle) * radius, 0, -Math.abs(Math.cos(angle) * radius));

    scene.add(enemyGroup);

    enemies.push({
      group: enemyGroup,
      mesh: enemyMesh,
      mat: enemyMat,
      health: 100,
      isStaggered: false,
      attackCooldown: 0
    });
  }
}

// Spartan Rage State
let rageMeter = 0;
const MAX_RAGE = 100;
let isRageActive = false;
let rageTimer = null;
let rageAchievementUnlocked = false;
let bossDefeatAchievementUnlocked = false;
let wave10AchievementUnlocked = false;

let basePlayerSpeed = 0.1;
let currentPlayerSpeed = basePlayerSpeed;
let baseDamage = 35;
let currentDamage = baseDamage;

const rageFill = document.getElementById('rage-fill');

function triggerAchievement(achievementId) {
  PlatformAPI.unlockAchievement(achievementId);
}

function addRage(amount) {
  if (isRageActive) return;
  rageMeter = Math.min(MAX_RAGE, rageMeter + amount);
  if (rageFill) {
    rageFill.style.width = rageMeter + '%';
  }
}

function playRageRoar() {
  if (!audioCtx || !isAudioEnabled) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(90, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.6);

  gain.gain.setValueAtTime(0.22, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.6);
}

function deactivateSpartanRage() {
  isRageActive = false;

  currentPlayerSpeed = basePlayerSpeed;
  currentDamage = baseDamage;

  bodyMat.color.setHex(0xbbbbbb);
  dirLight.color.setHex(0xff4500);
  dirLight.intensity = 1.2;

  if (audioCtx && droneOsc1 && droneOsc2) {
    droneOsc1.frequency.setValueAtTime(55, audioCtx.currentTime);
    droneOsc2.frequency.setValueAtTime(82.41, audioCtx.currentTime);
  }
}

function activateSpartanRage() {
  if (rageMeter < MAX_RAGE || isRageActive || !isPlayerAlive) return;

  isRageActive = true;
  rageMeter = 0;
  if (rageFill) rageFill.style.width = '0%';

  if (!rageAchievementUnlocked) {
    triggerAchievement('ACH_SPARTAN_RAGE');
    rageAchievementUnlocked = true;
  }

  currentPlayerSpeed = basePlayerSpeed * 1.8;
  currentDamage = baseDamage * 2.5;

  bodyMat.color.setHex(0xff2200);
  dirLight.color.setHex(0xff1100);
  dirLight.intensity = 2.5;

  if (audioCtx && droneOsc1 && droneOsc2) {
    droneOsc1.frequency.setValueAtTime(110, audioCtx.currentTime);
    droneOsc2.frequency.setValueAtTime(164.81, audioCtx.currentTime);
  }

  playImpactSound();
  screenShakeDuration = 20;

  clearTimeout(rageTimer);
  rageTimer = setTimeout(() => {
    deactivateSpartanRage();
  }, 8000);
}

let isAttacking = false;
let playerHealth = 100;
let comboCount = 0;
let comboTimer = 0;
let specialCooldown = 0;
let specialMoveFlash = 0;
let isWeaponThrown = false;
let weaponVelocity = new THREE.Vector3();
const weaponOriginalLocalPos = weapon.position.clone();
let weaponThrowLife = 0;

// Block & Parry States
let isBlocking = false;
let isParrying = false;
let parryWindowTimer = null;
const PARRY_WINDOW_MS = 250; // 250ms window to trigger a perfect parry

// Screen Shake & Hit Stop
let screenShakeDuration = 0;
let screenShakeIntensity = 0.08;
let hitStopTimer = 0;
let originalCameraOffset = new THREE.Vector3(1.5, 2.5, 4);

// Floating Damage Numbers
const floatingTexts = [];

// Array to track active particle instances
const activeParticles = [];

function spawnHitSparks(impactPoint, particleColor = 0xffaa00) {
  const particleCount = 20;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = [];

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = impactPoint.x;
    positions[i * 3 + 1] = impactPoint.y;
    positions[i * 3 + 2] = impactPoint.z;

    velocities.push(new THREE.Vector3(
      (Math.random() - 0.5) * 0.3,
      Math.random() * 0.2 + 0.1,
      (Math.random() - 0.5) * 0.3
    ));
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: particleColor,
    size: 0.15,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending
  });

  const pSystem = new THREE.Points(geometry, material);
  scene.add(pSystem);

  activeParticles.push({
    mesh: pSystem,
    velocities: velocities,
    life: 1.0
  });
}

// Ranged Weapon Projectiles
const projectiles = [];

// Bounding Boxes for Collision
const weaponBox = new THREE.Box3();
const enemyBox = new THREE.Box3();

// Camera Offset (Over-The-Shoulder God of War View)
let cameraOffset = new THREE.Vector3(1.5, 2.5, 4);

// Simple HUD for Enemy Health / State
const hud = document.createElement('div');
hud.style.position = 'absolute';
hud.style.top = '16px';
hud.style.left = '16px';
hud.style.padding = '10px 14px';
hud.style.borderRadius = '8px';
hud.style.background = 'rgba(0, 0, 0, 0.45)';
hud.style.color = '#fff';
hud.style.fontFamily = 'sans-serif';
hud.style.fontSize = '16px';
hud.style.fontWeight = '600';
hud.style.zIndex = '10';
hud.textContent = 'Enemy: 100 HP | Player: 100 HP';
document.body.appendChild(hud);

// Input Handling
const keys = {};
window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'q') {
    if (!isLockedOn && boss) {
      isLockedOn = true;
      lockTarget = boss.group;
    } else {
      isLockedOn = false;
      lockTarget = null;
    }
  }
});

let isPlayerAlive = true;

document.getElementById('high-score-val').innerText = gameStats.highScore;
document.getElementById('max-wave-val').innerText = gameStats.maxWave;

function updateHUD() {
  const aliveEnemies = getAliveEnemies();
  const totalEnemyHealth = aliveEnemies.reduce((sum, enemy) => sum + enemy.health, 0);

  if (!isPlayerAlive) {
    hud.textContent = `Enemy: ${aliveEnemies.length ? `${aliveEnemies.length} alive (${totalEnemyHealth} HP)` : 'Defeated'} | Player: Defeated | Combo: ${comboCount} | Special: ${specialCooldown > 0 ? specialCooldown.toFixed(1) + 's' : 'Ready'}`;
    return;
  }

  if (aliveEnemies.length === 0) {
    hud.textContent = `Enemy: Defeated | Player: ${playerHealth} HP | Combo: ${comboCount} | Special: ${specialCooldown > 0 ? specialCooldown.toFixed(1) + 's' : 'Ready'}`;
    return;
  }

  hud.textContent = `Enemy: ${aliveEnemies.length} alive (${totalEnemyHealth} HP) | Player: ${playerHealth} HP | Combo: ${comboCount} | Special: ${specialCooldown > 0 ? specialCooldown.toFixed(1) + 's' : 'Ready'}`;
}

function updatePlayerHealth(amount) {
  if (!isPlayerAlive) return;

  const wasDamageTaken = amount < 0;
  playerHealth = Math.max(0, playerHealth + amount);
  addRage(10);

  if (wasDamageTaken && !isRageActive) {
    triggerRumble(0.9, 0.6, 300);
    screenShakeDuration = 15;
    screenShakeIntensity = 0.2;
  }

  if (playerHealth <= 0) {
    isPlayerAlive = false;
    bodyMat.color.setHex(0x333333);
    gameStats = saveGameProgress(currentWave, playerScore);
    document.getElementById('high-score-val').innerText = gameStats.highScore;
    document.getElementById('max-wave-val').innerText = gameStats.maxWave;
    playDefeatSting();
    triggerRumble(1.0, 1.0, 800);
    alert(`Game Over! Final Score: ${playerScore} | High Score: ${gameStats.highScore}`);
    updateHUD();
    return;
  }

  updateHUD();
}

function startBlock() {
  if (!isPlayerAlive || isAttacking || isBlocking) return;

  isBlocking = true;
  isParrying = true;
  shieldMat.opacity = 0.8;

  clearTimeout(parryWindowTimer);
  parryWindowTimer = setTimeout(() => {
    isParrying = false;
    shieldMat.color.setHex(0x0044aa);
  }, PARRY_WINDOW_MS);
}

function stopBlock() {
  isBlocking = false;
  isParrying = false;
  clearTimeout(parryWindowTimer);
  shieldMat.opacity = 0;
  shieldMat.color.setHex(0x00aaff);
}

function returnWeaponToHand() {
  if (!isWeaponThrown) return;

  playerGroup.add(weapon);
  weapon.position.copy(weaponOriginalLocalPos);
  weapon.rotation.set(0, 0, 0);
  isWeaponThrown = false;
  weaponVelocity.set(0, 0, 0);
  weaponThrowLife = 0;
}

function fireProjectile() {
  const aliveEnemies = getAliveEnemies();
  if (!isPlayerAlive || aliveEnemies.length === 0) return;

  const target = aliveEnemies.reduce((closest, enemy) => {
    const enemyDist = enemy.group.position.distanceTo(playerGroup.position);
    const closestDist = closest ? closest.group.position.distanceTo(playerGroup.position) : Infinity;
    return enemyDist < closestDist ? enemy : closest;
  }, null);

  if (!target) return;

  const direction = new THREE.Vector3().subVectors(target.group.position, playerGroup.position);
  direction.y = 0;
  if (direction.lengthSq() === 0) return;
  direction.normalize();

  const projectile = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x004444 })
  );

  projectile.position.copy(playerGroup.position).add(new THREE.Vector3(0, 1.2, 0));
  scene.add(projectile);

  projectiles.push({
    mesh: projectile,
    velocity: direction.multiplyScalar(0.22),
    life: 90,
    damage: 30,
    targetId: target.group.uuid
  });
}

function triggerSpecialMove() {
  const aliveEnemies = getAliveEnemies();
  if (!isPlayerAlive || aliveEnemies.length === 0 || specialCooldown > 0 || comboCount < 3 || isAttacking) return;

  isAttacking = true;
  const finisherBonus = comboCount * 12;
  const finisherDamage = 60 + finisherBonus;

  const target = aliveEnemies.reduce((closest, enemy) => {
    const distance = enemy.group.position.distanceTo(playerGroup.position);
    const closestDistance = closest ? closest.group.position.distanceTo(playerGroup.position) : Infinity;
    return distance < closestDistance ? enemy : closest;
  }, null);

  if (target && target.group.position.distanceTo(playerGroup.position) <= 2.5) {
    target.health -= finisherDamage;

    screenShakeDuration = 18;
    hitStopTimer = 8;
    specialCooldown = 4.5;
    specialMoveFlash = 0.5;

    const specialText = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeDamageTexture('FINISHER'),
        transparent: true,
        depthWrite: false,
        opacity: 1
      })
    );

    specialText.position.set(target.group.position.x, 3.5, target.group.position.z);
    specialText.scale.set(3.2, 1.2, 1);
    specialText.userData = { life: 45, velocityY: 0.04 };
    scene.add(specialText);
    floatingTexts.push(specialText);

    target.mat.color.setHex(0xffcc00);
    target.group.position.z -= 1.0;

    setTimeout(() => {
      target.mat.color.setHex(0xff0033);
    }, 140);

    if (target.health <= 0) {
      scene.remove(target.group);
      target.group.userData.dead = true;
      target.health = 0;
    }
  } else {
    specialCooldown = 2.0;
    specialMoveFlash = 0.25;
  }

  comboCount = 0;
  comboTimer = 0;
  weapon.rotation.z -= Math.PI / 2;
  setTimeout(() => {
    weapon.rotation.z += Math.PI / 2;
    isAttacking = false;
  }, 220);

  updateHUD();
}

window.addEventListener('keydown', (e) => {
  initAudio();
  if (e.code === 'Space' && !e.repeat) startBlock();
  if (e.key.toLowerCase() === 'e' && !e.repeat) fireProjectile();
  if (e.key.toLowerCase() === 'f' && !e.repeat) triggerSpecialMove();
  if (e.key.toLowerCase() === 'r') {
    activateSpartanRage();
  }
});

const audioToggleButton = document.getElementById('audio-toggle');
if (audioToggleButton) {
  audioToggleButton.addEventListener('click', () => {
    if (!audioCtx) initAudio();
    toggleAudio();
  });
}
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') stopBlock();
});

if (window.electronAPI && typeof window.electronAPI.onUpdateDownloaded === 'function') {
  const updateModal = document.getElementById('update-modal');
  const restartBtn = document.getElementById('btn-restart-update');
  const laterBtn = document.getElementById('btn-later-update');

  window.electronAPI.onUpdateDownloaded(() => {
    if (updateModal) updateModal.style.display = 'flex';
  });

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      window.electronAPI.restartAndInstall();
    });
  }

  if (laterBtn) {
    laterBtn.addEventListener('click', () => {
      if (updateModal) updateModal.style.display = 'none';
    });
  }
}

window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mousedown', (e) => {
  initAudio();

  if (e.button === 2 && isPlayerAlive) {
    if (!isWeaponThrown) {
      isWeaponThrown = true;
      weaponThrowLife = 120;

      const worldPos = new THREE.Vector3();
      weapon.getWorldPosition(worldPos);

      scene.attach(weapon);
      weapon.position.copy(worldPos);
      weaponVelocity.set(0, 0, -0.5);
    } else {
      returnWeaponToHand();
    }

    return;
  }

  if (e.button === 2) startBlock();

  if (e.button === 0 && !isAttacking) {
    initAudio();
    playSwordSwish();
    isAttacking = true;

    // Combo System
    comboCount += 1;
    comboTimer = 1.2;

    const damage = currentDamage + Math.min(comboCount - 1, 3) * 10;

    // Weapon Attack Animation
    weapon.rotation.z -= Math.PI / 2;

    // Raycast against all active enemy meshes and the boss
    const activeEnemyMeshes = enemies.filter((enemy) => enemy && enemy.health > 0).map((enemy) => enemy.mesh);
    if (boss && boss.mesh) activeEnemyMeshes.push(boss.mesh);

    const attackOrigin = playerGroup.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const attackDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(playerGroup.quaternion).normalize();
    raycaster.set(attackOrigin, attackDirection);
    const intersects = raycaster.intersectObjects(activeEnemyMeshes, false);

    if (intersects.length > 0) {
      const hitPoint = intersects[0].point;
      const hitMesh = intersects[0].object;
      const targetEnemy = enemies.find((enemy) => enemy && enemy.mesh === hitMesh);

      spawnHitSparks(hitPoint, isRageActive ? 0xff0000 : 0xffaa00);

      if (targetEnemy && targetEnemy.health > 0) {
        const isCrit = isRageActive;
        const damageDealt = isCrit ? damage * 1.5 : damage;

        targetEnemy.health -= damageDealt;
        spawnDamageNumber(damageDealt, targetEnemy.group.position, isCrit);
        addRage(15);

        if (damageDealt >= 45) {
          playCritHitStopSound();
        } else {
          playImpactSound();
        }

        screenShakeDuration = 10;
        hitStopTimer = 6;

        const damageText = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: makeDamageTexture(String(Math.round(damageDealt))),
            transparent: true,
            depthWrite: false,
            opacity: 1
          })
        );

        damageText.position.set(targetEnemy.group.position.x, 3, targetEnemy.group.position.z);
        damageText.scale.set(2.4, 0.9, 1);
        damageText.userData = { life: 40, velocityY: 0.04 };
        scene.add(damageText);
        floatingTexts.push(damageText);

        targetEnemy.mat.color.setHex(0xffffff);
        targetEnemy.group.position.z -= 0.5;

        setTimeout(() => {
          if (targetEnemy && targetEnemy.health > 0) targetEnemy.mat.color.setHex(0xff0033);
        }, 100);

        if (targetEnemy.health <= 0) {
          targetEnemy.health = 0;
          addRage(20);
          playEnemyDeathSound();
          scene.remove(targetEnemy.group);
        }
        updateHUD();
      } else if (boss && hitMesh === boss.mesh) {
        const isCrit = isRageActive;
        const damageDealt = isCrit ? damage * 1.5 : damage;

        updateBossHealth(damageDealt);
        spawnDamageNumber(damageDealt, boss.group.position, isCrit);
        spawnHitSparks(boss.group.position.clone(), isCrit ? 0xffcc00 : 0xffaa00);

        if (damageDealt >= 45) {
          playCritHitStopSound();
        } else {
          playImpactSound();
        }

        screenShakeDuration = 10;
        hitStopTimer = 6;
      }
    }

    setTimeout(() => {
      weapon.rotation.z += Math.PI / 2;
      isAttacking = false;
    }, 200);
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 2) stopBlock();
});

function makeDamageTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function spawnDamageNumber(amount, targetWorldPos, isCrit = false) {
  const vector = targetWorldPos.clone();
  vector.y += 2.0;
  vector.project(camera);

  const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;

  const numElem = document.createElement('div');
  numElem.className = 'damage-number' + (isCrit ? ' crit' : '');
  numElem.innerText = Math.round(amount);
  numElem.style.left = `${x}px`;
  numElem.style.top = `${y}px`;

  document.body.appendChild(numElem);

  setTimeout(() => {
    if (numElem.parentNode) {
      numElem.parentNode.removeChild(numElem);
    }
  }, 800);
}

function enemyAttackLogic() {
  for (const enemy of enemies) {
    if (!enemy || enemy.health <= 0 || enemy.attackCooldown > 0 || enemy.isStaggered) continue;

    const distance = enemy.group.position.distanceTo(playerGroup.position);

    if (distance <= 1.8) {
      enemy.attackCooldown = 1.5;
      enemy.mat.color.setHex(0xffff00);

      setTimeout(() => {
        if (enemy.health > 0 && isPlayerAlive && !enemy.isStaggered) {
          const strikeDistance = enemy.group.position.distanceTo(playerGroup.position);

          if (strikeDistance <= 2.0) {
            if (isParrying) {
              playShieldBlockSound();
              screenShakeDuration = 15;
              enemy.mat.color.setHex(0xffaa00);
              enemy.isStaggered = true;

              shieldMat.color.setHex(0xffffff);
              setTimeout(() => shieldMat.color.setHex(0x00aaff), 150);

              enemy.group.position.z -= 1.2;
              setTimeout(() => {
                enemy.isStaggered = false;
                enemy.mat.color.setHex(0xff0033);
              }, 1500);
            } else if (isBlocking) {
              playShieldBlockSound();
              updatePlayerHealth(-5);
              screenShakeDuration = 4;
              shieldMat.color.setHex(0x00ffff);
              setTimeout(() => shieldMat.color.setHex(0x0044aa), 100);
            } else {
              updatePlayerHealth(-20);
              screenShakeDuration = 8;
              body.material.color.setHex(0xff0000);
              setTimeout(() => body.material.color.setHex(0xbbbbbb), 150);
            }
          }
        }

        if (!enemy.isStaggered) {
          enemy.mat.color.setHex(0xff0033);
        }

        setTimeout(() => {
          enemy.attackCooldown = 0;
        }, 1500);
      }, 600);
    }
  }
}

function processGamepadInputs() {
  if (activeGamepadIndex === null) return;

  const gamepads = navigator.getGamepads();
  const gp = gamepads[activeGamepadIndex];
  if (!gp) return;

  const deadzone = 0.15;
  let moveX = gp.axes[0];
  let moveZ = gp.axes[1];

  if (Math.abs(moveX) < deadzone) moveX = 0;
  if (Math.abs(moveZ) < deadzone) moveZ = 0;

  if ((moveX !== 0 || moveZ !== 0) && isPlayerAlive) {
    const nextPos = playerGroup.position.clone();
    nextPos.x += moveX * currentPlayerSpeed;
    nextPos.z += moveZ * currentPlayerSpeed;

    if (!checkPlayerCollision(nextPos)) {
      playerGroup.position.copy(nextPos);
    }
  }

  if (isButtonPressed(gp, 0)) {
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
  }

  if (isButtonPressed(gp, 3)) {
    window.dispatchEvent(new MouseEvent('mousedown', { button: 2 }));
  }

  if (isButtonPressed(gp, 11)) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
  }

  if (gp.buttons[4]?.pressed && gp.buttons[5]?.pressed) {
    activateSpartanRage();
  }
}

// Game Loop
function animate() {
  requestAnimationFrame(animate);

  if (!gameStarted) {
    renderer.render(scene, camera);
    return;
  }

  processGamepadInputs();

  if (screenShakeDuration > 0) {
    screenShakeDuration--;
  }

  if (hitStopTimer > 0) {
    hitStopTimer--;
  }

  for (const enemy of enemies) {
    if (enemy && enemy.attackCooldown > 0) {
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - 1 / 60);
    }
  }

  if (specialCooldown > 0) {
    specialCooldown -= 1 / 60;
  }

  if (specialMoveFlash > 0) {
    specialMoveFlash -= 1 / 60;
    weaponMat.emissive.setHex(0x00ffff);
    if (specialMoveFlash <= 0) {
      weaponMat.emissive.setHex(0x000000);
    }
  }

  if (comboTimer > 0) {
    comboTimer -= 1 / 60;
  } else {
    comboCount = 0;
  }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const text = floatingTexts[i];

    if (text.userData) {
      text.userData.life -= 1;
      text.position.y += text.userData.velocityY;
      text.material.opacity = Math.max(0, text.userData.life / 40);

      if (text.userData.life <= 0) {
        scene.remove(text);
        text.material.map.dispose();
        text.material.dispose();
        floatingTexts.splice(i, 1);
      }
      continue;
    }

    if (text.mesh) {
      text.life -= 1;
      text.mesh.scale.setScalar(1 + (text.maxLife - text.life) * 0.04);
      text.mesh.material.opacity = Math.max(0.05, text.life / text.maxLife);

      if (text.life <= 0) {
        playerGroup.remove(text.mesh);
        text.mesh.geometry.dispose();
        text.mesh.material.dispose();
        floatingTexts.splice(i, 1);
      }
    }
  }

  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const p = activeParticles[i];
    p.life -= 0.04;

    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      activeParticles.splice(i, 1);
    } else {
      const posAttr = p.mesh.geometry.attributes.position;
      const posArray = posAttr.array;

      for (let j = 0; j < p.velocities.length; j++) {
        posArray[j * 3] += p.velocities[j].x;
        posArray[j * 3 + 1] += p.velocities[j].y;
        posArray[j * 3 + 2] += p.velocities[j].z;

        p.velocities[j].y -= 0.008;
      }

      posAttr.needsUpdate = true;
      p.mesh.material.opacity = p.life;
    }
  }

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    projectile.mesh.position.add(projectile.velocity);
    projectile.life -= 1;

    const hitEnemy = getAliveEnemies().find((enemy) => projectile.mesh.position.distanceTo(enemy.group.position) < 1.0);
    if (hitEnemy) {
      hitEnemy.health -= projectile.damage;
      screenShakeDuration = 10;
      hitStopTimer = 4;

      const damageText = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeDamageTexture(String(projectile.damage)),
          transparent: true,
          depthWrite: false,
          opacity: 1
        })
      );

      damageText.position.set(hitEnemy.group.position.x, 3, hitEnemy.group.position.z);
      damageText.scale.set(2.4, 0.9, 1);
      damageText.userData = { life: 40, velocityY: 0.04 };
      scene.add(damageText);
      floatingTexts.push(damageText);
      spawnHitSparks(hitEnemy.group.position.clone(), 0xff6600);

      if (hitEnemy.health <= 0) {
        hitEnemy.health = 0;
        playEnemyDeathSound();
        scene.remove(hitEnemy.group);
      }
      updateHUD();

      scene.remove(projectile.mesh);
      projectiles.splice(i, 1);
      continue;
    }

    if (projectile.life <= 0) {
      scene.remove(projectile.mesh);
      projectiles.splice(i, 1);
    }
  }

  if (isPlayerAlive) {
    const speed = currentPlayerSpeed;
    const nextPos = playerGroup.position.clone();

    if (isLockedOn && lockTarget) {
      const forward = new THREE.Vector3();
      playerGroup.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3(-forward.z, 0, forward.x);

      if (keys['w']) nextPos.addScaledVector(forward, speed);
      if (keys['s']) nextPos.addScaledVector(forward, -speed);
      if (keys['a']) nextPos.addScaledVector(right, -speed);
      if (keys['d']) nextPos.addScaledVector(right, speed);
    } else {
      if (keys['w']) nextPos.z -= speed;
      if (keys['s']) nextPos.z += speed;
      if (keys['a']) nextPos.x -= speed;
      if (keys['d']) nextPos.x += speed;
    }

    if (!checkPlayerCollision(nextPos)) {
      playerGroup.position.copy(nextPos);
    }
  }

  chests.forEach((chest) => {
    if (!chest.collected) {
      const distance = playerGroup.position.distanceTo(chest.mesh.position);

      if (distance < 1.5) {
        chest.collected = true;
        scene.remove(chest.mesh);

        updatePlayerHealth(30);

        bodyMat.color.setHex(0x00ff66);
        setTimeout(() => bodyMat.color.setHex(0xbbbbbb), 200);

        screenShakeDuration = 5;
      }
    }
  });

  if (isWeaponThrown) {
    weapon.position.add(weaponVelocity);
    weapon.rotation.x += 0.2;
    weaponThrowLife -= 1;

    const thrownWeaponBox = new THREE.Box3().setFromObject(weapon);
    const hitEnemy = getAliveEnemies().find((enemy) => thrownWeaponBox.intersectsBox(new THREE.Box3().setFromObject(enemy.group)));

    if (hitEnemy) {
      hitEnemy.health -= 35;
      spawnHitSparks(hitEnemy.group.position.clone(), 0xff9900);
      screenShakeDuration = 10;
      hitEnemy.mat.color.setHex(0xffffff);
      hitEnemy.group.position.z -= 0.8;
      setTimeout(() => {
        if (hitEnemy.health > 0) hitEnemy.mat.color.setHex(0xff0033);
      }, 100);

      if (hitEnemy.health <= 0) {
        hitEnemy.health = 0;
        playEnemyDeathSound();
        scene.remove(hitEnemy.group);
      }

      playerGroup.add(weapon);
      weapon.position.copy(weaponOriginalLocalPos);
      weapon.rotation.set(0, 0, 0);
      isWeaponThrown = false;
      updateHUD();
    } else if (weaponThrowLife <= 0 || weapon.position.length() > 20) {
      returnWeaponToHand();
    }
  }

  enemies = enemies.filter((enemy) => enemy && enemy.health > 0 && enemy.group);

  if (isRageActive) {
    const rageTrail = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8c00, transparent: true, opacity: 0.7 })
    );
    rageTrail.position.copy(playerGroup.position).add(new THREE.Vector3(0, 0.5, 0));
    scene.add(rageTrail);
    floatingTexts.push({
      mesh: rageTrail,
      life: 18,
      maxLife: 18,
      userData: null
    });
  }

  const aliveEnemies = getAliveEnemies();
  for (const enemy of aliveEnemies) {
    const direction = new THREE.Vector3();
    direction.subVectors(playerGroup.position, enemy.group.position);
    direction.y = 0;

    const distance = direction.length();
    if (distance > 1.4 && !enemy.isStaggered) {
      direction.normalize();
      enemy.group.position.addScaledVector(direction, 0.025);
    }

    enemy.group.lookAt(playerGroup.position.x, enemy.group.position.y, playerGroup.position.z);
  }

  if (boss) {
    updateBossBehavior();
  }

  if (aliveEnemies.length > 0) {
    enemyAttackLogic();
  } else if (!isWaveTransitioning && isPlayerAlive) {
    isWaveTransitioning = true;
    playerScore += currentWave * 100;

    if (currentWave >= 10 && !wave10AchievementUnlocked) {
      triggerAchievement('ACH_WAVE_10');
      wave10AchievementUnlocked = true;
    }

    gameStats = saveGameProgress(currentWave, playerScore);
    document.getElementById('high-score-val').innerText = gameStats.highScore;
    document.getElementById('max-wave-val').innerText = gameStats.maxWave;

    currentWave += 1;
    setTimeout(() => {
      spawnWave(currentWave);
    }, 2000);
  }

  if (isLockedOn && lockTarget && boss) {
    playerGroup.lookAt(lockTarget.position.x, playerGroup.position.y, lockTarget.position.z);

    const midpoint = new THREE.Vector3().addVectors(playerGroup.position, lockTarget.position).multiplyScalar(0.5);
    const camOffset = new THREE.Vector3(0, 3, 6);
    const targetCamPos = playerGroup.position.clone().add(camOffset);

    if (screenShakeDuration > 0) {
      targetCamPos.x += (Math.random() - 0.5) * screenShakeIntensity;
      targetCamPos.y += (Math.random() - 0.5) * screenShakeIntensity;
      screenShakeDuration--;
    }

    camera.position.copy(targetCamPos);
    camera.lookAt(midpoint);
  } else {
    const targetCamPos = playerGroup.position.clone().add(originalCameraOffset);

    if (screenShakeDuration > 0) {
      targetCamPos.x += (Math.random() - 0.5) * screenShakeIntensity;
      targetCamPos.y += (Math.random() - 0.5) * screenShakeIntensity;
      screenShakeDuration--;
    }

    camera.position.copy(targetCamPos);
    camera.lookAt(playerGroup.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
  }

  renderer.render(scene, camera);
}

animate();

// Handle Window Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});