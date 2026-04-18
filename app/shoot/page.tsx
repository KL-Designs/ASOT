'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Engine, Scene, UniversalCamera,
  Vector3, Color3, Color4,
  MeshBuilder, StandardMaterial, Texture, DynamicTexture,
  HemisphericLight, SpotLight,
} from '@babylonjs/core';

// ─── Audio ────────────────────────────────────────────────────────────────────

function getCtx(ref: React.MutableRefObject<AudioContext | null>): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ref.current) ref.current = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ref.current.state === 'suspended') ref.current.resume();
  return ref.current;
}
function sndShot(ctx: AudioContext) {
  const n = Math.floor(ctx.sampleRate * 0.09);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.16));
  const src = ctx.createBufferSource(); src.buffer = buf;
  const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 500; flt.Q.value = 0.6;
  const g = ctx.createGain(); g.gain.value = 1.0;
  src.connect(flt); flt.connect(g); g.connect(ctx.destination); src.start();
}
function sndHit(ctx: AudioContext) {
  // Delayed slightly so it lands after the gunshot sound
  const t = ctx.currentTime + 0.08;
  const n = Math.floor(ctx.sampleRate * 0.045);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.25));
  const src = ctx.createBufferSource(); src.buffer = buf;
  const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1800;
  const g = ctx.createGain(); g.gain.value = 0.75;
  src.connect(flt); flt.connect(g); g.connect(ctx.destination); src.start(t);
}
function sndKill(ctx: AudioContext) {
  // Happy ascending chime — major triad arpeggio
  const t = ctx.currentTime;
  [523, 659, 784, 1047].forEach((freq, i) => {
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = freq;
    const at = t + i * 0.07;
    g.gain.setValueAtTime(0.22, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
    osc.connect(g); g.connect(ctx.destination); osc.start(at); osc.stop(at + 0.2);
  });
}
function sndDamage(ctx: AudioContext) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(80, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
  g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(g); g.connect(ctx.destination); osc.start(t); osc.stop(t + 0.22);
}
function sndEmpty(ctx: AudioContext) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.type = 'square'; osc.frequency.value = 110;
  g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  osc.connect(g); g.connect(ctx.destination); osc.start(t); osc.stop(t + 0.07);
}
function sndWarning(ctx: AudioContext) {
  const t = ctx.currentTime;
  [1400, 900].forEach((freq, i) => {
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'square'; osc.frequency.value = freq;
    const at = t + i * 0.09;
    g.gain.setValueAtTime(0.38, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
    osc.connect(g); g.connect(ctx.destination); osc.start(at); osc.stop(at + 0.08);
  });
}
function sndReload(ctx: AudioContext) {
  const t = ctx.currentTime;
  [261, 329, 392, 523].forEach((freq, i) => {
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'square'; osc.frequency.value = freq;
    const at = t + i * 0.13;
    g.gain.setValueAtTime(0.14, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
    osc.connect(g); g.connect(ctx.destination); osc.start(at); osc.stop(at + 0.1);
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RS      = 8;     // room size (world units)
const RH      = 3.8;   // room height
const WT      = 0.6;   // wall thickness
const EYE     = 1.65;  // eye height
const GRAV    = -22;
const JUMP    = 8.5;
const PIXEL   = 2;     // render at half-res for retro look
const AMMO_MAX      = 10;
const MAX_HP        = 100;
const STAMINA_MAX   = 100;
const STAMINA_DRAIN = 35;   // per second while sprinting
const STAMINA_REGEN = 18;   // per second while walking/idle
const SPRINT_MULT   = 1.85;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnemyData {
  root: any;
  hitbox: any;
  mat: StandardMaterial;
  neonColor: Color3;
  hp: number;
  alive: boolean;
  hit: boolean;
  hitTime: number;
  speed: number;
  strafePhase: number; // random phase offset for sideways oscillation
  strafeFreq: number;  // oscillation rate (rad/ms) — varies per enemy for unpredictability
  lunging: boolean;    // true = sprinting burst; false = frozen
  phaseUntil: number;  // ms timestamp when to flip phase
}

interface CeilingLightData {
  bulbMat: StandardMaterial;
  color: Color3;
  base: number;
  phase: number;
  freq: number;
  style: 'warm' | 'cold' | 'dying';
}

// ─── Room builder ─────────────────────────────────────────────────────────────


function buildRoom(
  scene: Scene,
  gx: number, gz: number,
  n: boolean, s: boolean, e: boolean, w: boolean,
  roomIdx: number,
  avatarPool: { name: string; url: string }[]
): { enemies: EnemyData[]; lights: CeilingLightData[]; disposables: any[] } {
  const x0 = gx * RS, z0 = gz * RS;
  const cx  = x0 + RS / 2, cz = z0 + RS / 2;
  const disposables: any[] = [];
  const enemies: EnemyData[] = [];
  const lights: CeilingLightData[] = [];

  // Backrooms materials — cream wallpaper, tan carpet, drop-tile ceiling
  const mkDiffuse = (hex: number) => {
    const r = ((hex >> 16) & 0xff) / 255;
    const g = ((hex >> 8)  & 0xff) / 255;
    const b = ( hex        & 0xff) / 255;
    const mat = new StandardMaterial('bm' + Math.random(), scene);
    mat.diffuseColor          = new Color3(r, g, b);
    mat.specularColor         = new Color3(0.04, 0.03, 0.01);
    mat.maxSimultaneousLights = 8;
    return mat;
  };

  const wallMat  = mkDiffuse(0xe8d5a3); // cream-yellow wallpaper
  const floorMat = mkDiffuse(0xa89060); // tan/brown carpet
  const ceilMat  = mkDiffuse(0xe0ddd0); // off-white drop tiles
  ceilMat.emissiveColor = new Color3(0.55, 0.53, 0.48); // self-lit so downward face stays visible

  // Wire up textures when present in public/textures/backrooms/
  const applyTex = (mat: StandardMaterial, url: string, u: number, v: number) => {
    const tex = new Texture(url, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE,
      null, () => { mat.diffuseTexture = null; }); // silently remove on 404
    tex.uScale = u; tex.vScale = v;
    mat.diffuseTexture = tex;
  };
  applyTex(wallMat,  '/textures/backrooms/wall.png',  3, 2);
  applyTex(floorMat, '/textures/backrooms/floor.png', 4, 4);
  applyTex(ceilMat,  '/textures/backrooms/roof.png',  3, 3);

  const addWall = (wcx: number, wcy: number, wcz: number, ww: number, wh: number, wd: number, solid = true) => {
    const mesh = MeshBuilder.CreateBox('wall', { width: ww, height: wh, depth: wd }, scene);
    mesh.position = new Vector3(wcx, wcy, wcz);
    mesh.material = wallMat;
    if (solid) mesh.checkCollisions = true;
    disposables.push(mesh);
    return mesh;
  };

  // ── Floor ────────────────────────────────────────────────────────────────
  const floor = MeshBuilder.CreateGround('floor', { width: RS, height: RS, subdivisions: RS }, scene);
  floor.position = new Vector3(cx, 0, cz);
  floor.material = floorMat;
  disposables.push(floor);

  // ── Ceiling ───────────────────────────────────────────────────────────────
  const ceil = MeshBuilder.CreateGround('ceil', { width: RS, height: RS }, scene);
  ceil.position    = new Vector3(cx, RH, cz);
  ceil.rotation.x  = Math.PI; // flip to face downward
  ceil.material    = ceilMat;
  disposables.push(ceil);
  // No overhead lights — the player's flashlight is the only source

  // ── Walls (BoxGeometry = thick, collision-safe, no see-through) ───────────
  // Extend each wall by WT on each perpendicular end to fill corners solid.
  if (!s) addWall(cx,             RH / 2, z0 + WT / 2,       RS + WT * 2, RH, WT);
  if (!n) addWall(cx,             RH / 2, z0 + RS - WT / 2,   RS + WT * 2, RH, WT);
  if (!w) addWall(x0 + WT / 2,   RH / 2, cz,                 WT, RH, RS + WT * 2);
  if (!e) addWall(x0 + RS - WT / 2, RH / 2, cz,              WT, RH, RS + WT * 2);

  // No ceiling strip lights — darkness is intentional

  // ── Obstacles ─────────────────────────────────────────────────────────────
  if (roomIdx >= 2) {
    const inner = RS - WT * 2 - 1;
    const count = Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const ow = 0.5 + Math.random() * 0.9;
      const oh = 0.6 + Math.random() * 1.6;
      const ox = x0 + WT + 0.5 + Math.random() * inner;
      const oz = z0 + WT + 0.5 + Math.random() * inner;
      const obs = MeshBuilder.CreateBox('obs', { width: ow, height: oh, depth: ow }, scene);
      obs.position      = new Vector3(ox, oh / 2, oz);
      obs.material        = mkDiffuse(0xd4c490); // cream backrooms pillar
      obs.checkCollisions = true;
      disposables.push(obs);
    }
  }

  // ── Enemies ───────────────────────────────────────────────────────────────
  if (roomIdx >= 2) {
    const inner = RS - WT * 2 - 1;
    const count = Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const ex = x0 + WT + 0.5 + Math.random() * inner;
      const ez = z0 + WT + 0.5 + Math.random() * inner;
      const av = avatarPool.length > 0
        ? avatarPool[Math.floor(Math.random() * avatarPool.length)]
        : null;
      const enemy = buildEnemy(scene, new Vector3(ex, 0, ez), av?.url ?? null, av?.name ?? '');
      enemies.push(enemy);
      disposables.push(enemy.root);
    }
  }

  // ── Ceiling lights — evenly spaced 2×2 grid of square panels ────────────
  const GRID_OFFSETS = [-RS / 4, RS / 4] as const;
  for (const dx of GRID_OFFSETS) {
    for (const dz of GRID_OFFSETS) {
      const lx = cx + dx;
      const lz = cz + dz;
      const style: 'warm' | 'cold' | 'dying' =
        roomIdx === 1 ? 'warm'
        : Math.random() < 0.10 ? 'dying'
        : Math.random() < 0.06 ? 'cold'
        : 'warm';
      const col = new Color3(0.98, 0.94, 0.76);
      const base = style === 'dying' ? 1.2 + Math.random() * 0.6
                 :                     9.0 + Math.random() * 3.0;

      // Square recessed panel flush with ceiling — emissive only, no PointLight
      const panel = MeshBuilder.CreateBox('fix', { width: 0.85, height: 0.04, depth: 0.85 }, scene);
      panel.position   = new Vector3(lx, RH - 0.02, lz);
      panel.isPickable = false;
      const bulbMat = new StandardMaterial('bm' + Math.random(), scene);
      bulbMat.emissiveColor = col.clone();
      bulbMat.specularColor = Color3.Black();
      panel.material = bulbMat;

      lights.push({ bulbMat, color: col, base, phase: Math.random() * Math.PI * 2, freq: 0.0015 + Math.random() * 0.007, style });
      disposables.push(panel);
    }
  }

  return { enemies, lights, disposables };
}

function buildEnemy(scene: Scene, pos: Vector3, avatarUrl: string | null, displayName: string): EnemyData {
  const mat = new StandardMaterial('em' + Math.random(), scene);
  mat.emissiveColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.backFaceCulling = false;

  if (avatarUrl) {
    const tex = new Texture(avatarUrl, scene);
    mat.diffuseTexture = tex;
    mat.diffuseColor   = Color3.White();
  } else {
    mat.diffuseColor = new Color3(0.85, 0.82, 0.75);
  }

  // Root — invisible anchor at ground level, drives AI position
  const root = MeshBuilder.CreateBox('eroot', { size: 0.001 }, scene);
  root.position   = pos.clone();
  root.isPickable = false;
  root.isVisible  = false;

  // Billboard plane — avatar (Doom-sprite style)
  const plane = MeshBuilder.CreatePlane('eplane', { width: 1.0, height: 1.0 }, scene);
  plane.position      = new Vector3(0, 1.0, 0);
  plane.material      = mat;
  plane.parent        = root;
  plane.isPickable    = false;
  plane.billboardMode = 2; // BILLBOARDMODE_Y

  // Name tag above avatar — drawn onto a DynamicTexture canvas
  const tagW = 512, tagH = 96;
  const nameTex = new DynamicTexture('nt' + Math.random(), { width: tagW, height: tagH }, scene, false);
  nameTex.hasAlpha = true;
  const ctx2d = nameTex.getContext() as unknown as CanvasRenderingContext2D;
  ctx2d.clearRect(0, 0, tagW, tagH);
  ctx2d.font = 'bold 52px Arial';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillStyle = 'rgba(237,237,237,0.92)';
  ctx2d.fillText(displayName, tagW / 2, tagH / 2, tagW - 16);
  nameTex.update();

  const nameMat = new StandardMaterial('nm' + Math.random(), scene);
  nameMat.diffuseTexture  = nameTex;
  nameMat.diffuseColor    = Color3.White();
  nameMat.emissiveColor   = Color3.Black();
  nameMat.specularColor   = Color3.Black();
  nameMat.backFaceCulling = false;
  nameMat.useAlphaFromDiffuseTexture = true;

  const nameTag = MeshBuilder.CreatePlane('ntag', { width: 1.2, height: 1.2 * (tagH / tagW) }, scene);
  nameTag.position      = new Vector3(0, 1.68, 0); // sits just above the avatar plane
  nameTag.material      = nameMat;
  nameTag.parent        = root;
  nameTag.isPickable    = false;
  nameTag.billboardMode = 2;

  // Invisible hitbox (the only pickable mesh) — cylinder so hits register from any angle
  const hitbox = MeshBuilder.CreateCylinder('hitbox', { height: 1.6, diameter: 0.9, tessellation: 8 }, scene);
  hitbox.position  = new Vector3(0, 0.8, 0);
  hitbox.parent    = root;
  hitbox.isVisible = false;
  hitbox.metadata  = { isEnemy: true };

  return {
    root, hitbox, mat,
    neonColor: Color3.White(),
    hp: 2, alive: true, hit: false, hitTime: 0,
    speed: 0.9 + Math.random() * 0.7,
    strafePhase: Math.random() * Math.PI * 2,
    strafeFreq:  0.0008 + Math.random() * 0.0012, // oscillation period 500–1250ms
    lunging:     false,
    phaseUntil:  0,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DungeonShooter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef  = useRef<AudioContext | null>(null);
  const gsRef     = useRef<'intro' | 'playing' | 'ended'>('intro');

  const [gameState,     setGameState]     = useState<'intro' | 'playing' | 'ended'>('intro');
  const [score,         setScore]         = useState(0);
  const [hp,            setHp]            = useState(MAX_HP);
  const [ammo,          setAmmo]          = useState(AMMO_MAX);
  const [kills,         setKills]         = useState(0);
  const [isReloading,   setIsReloading]   = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [feedback,      setFeedback]      = useState<{ text: string; color: string; key: number } | null>(null);
  const [roomsVisited,  setRoomsVisited]  = useState(0);
  const [crosshairHit,  setCrosshairHit]  = useState<'hit' | 'kill' | null>(null);
  const [stamina,       setStamina]       = useState(STAMINA_MAX);

  const scoreRef   = useRef(0);
  const hpRef      = useRef(MAX_HP);
  const ammoRef    = useRef(AMMO_MAX);
  const killsRef   = useRef(0);
  const reloadRef   = useRef(false);
  const staminaRef  = useRef(STAMINA_MAX);
  const radarRef   = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    document.body.classList.add('fullscreen-page', 'suppress-custom-cursor');
    return () => document.body.classList.remove('fullscreen-page', 'suppress-custom-cursor');
  }, []);

  const showFeedback = useCallback((text: string, color: string) => {
    setFeedback({ text, color, key: Date.now() });
    setTimeout(() => setFeedback(null), 700);
  }, []);

  // ─── Main Babylon effect ───────────────────────────────────────────────────

  useEffect(() => {
    if (gameState !== 'playing') return;
    gsRef.current = 'playing';

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Fetch member avatars for enemy skins (fire-and-forget; empty array = fallback colours)
    let avatarPool: { name: string; url: string }[] = [];
    // Avatars are fetched async; rooms with enemies are built inside the callback
    // so the pool is always populated before any enemy is spawned.

    // ── Engine + Scene ────────────────────────────────────────────────────
    const engine = new Engine(canvas, false);        // false = no antialiasing
    engine.setHardwareScalingLevel(PIXEL);           // render at half-res → pixelated

    const scene = new Scene(engine);
    scene.clearColor  = new Color4(0.05, 0.04, 0.02, 1);
    scene.fogMode     = Scene.FOGMODE_EXP2;
    scene.fogDensity  = 0.055;                         // backrooms haze — visible but not oppressive
    scene.fogColor    = new Color3(0.72, 0.65, 0.44);  // warm yellow haze
    scene.collisionsEnabled = true;

    // Negligible ambient — just enough to hint at room shapes beyond flashlight range
    // Backrooms: well-lit and unsettling, not dark horror
    const ambient = new HemisphericLight('amb', new Vector3(0, 1, 0), scene);
    ambient.intensity   = 1.1;
    ambient.diffuse     = new Color3(0.95, 0.88, 0.65); // warm fluorescent yellow from above
    ambient.groundColor = new Color3(0.72, 0.65, 0.42); // fill from below — lights vertical walls and enemies
    ambient.specular    = Color3.Black();                // no specular shimmer from ambient

    // ── FPS Camera ────────────────────────────────────────────────────────
    // We bypass attachControl entirely to avoid:
    //   1. Babylon's speed formula making movement feel sluggish
    //   2. The pointer-lock glitch (first mousemove after lock has huge movementX/Y)
    // Instead: manual mouse look + manual WASD with grid-based wall collision.
    const camera = new UniversalCamera('cam', new Vector3(RS / 2, EYE, RS / 2), scene);
    camera.minZ            = 0.05;
    camera.maxZ            = 80;
    camera.fov             = 1.45;
    camera.applyGravity = false;
    // Clear all built-in inputs — we drive everything manually
    camera.inputs.clear();

    // ── Flashlight ────────────────────────────────────────────────────────
    // Single SpotLight — cone wider than the camera FOV so the hard boundary
    // is never on screen. High exponent creates the natural bright-centre /
    // dim-edge gradient without any visible circular cutoff.
    const flashlight = new SpotLight(
      'flash',
      camera.position.clone(),
      new Vector3(0, 0, 1),
      Math.PI / 2.4,          // ~75° half-angle — wider than the diagonal FOV (~48°)
      7,                      // high exponent = bright centre, smooth natural fade to edges
      scene,
    );
    flashlight.diffuse    = new Color3(0.98, 0.94, 0.76); // warm yellow, matches ceiling lights
    flashlight.specular   = new Color3(0.08, 0.07, 0.04);
    flashlight.intensity  = 1.4; // supplemental only — rooms are already lit
    flashlight.range      = 35;

    // ── Proximity audio — beep that speeds up as enemies close in ────────────
    const proxCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Constant fluorescent hum — the signature backrooms sound
    const humOsc  = proxCtx.createOscillator();
    const humGain = proxCtx.createGain();
    humOsc.type = 'sawtooth';
    humOsc.frequency.value = 120; // 120 Hz = 2× mains frequency
    humGain.gain.value = 0.022;
    humOsc.connect(humGain); humGain.connect(proxCtx.destination);
    humOsc.start();

    // ── Gun viewmodel ─────────────────────────────────────────────────────────
    // Simple pistol built from boxes — rendered in the same scene but always
    // repositioned each frame to sit at a fixed offset from the camera.
    const gunMat = new StandardMaterial('gunMat', scene);
    gunMat.diffuseColor  = new Color3(0.10, 0.10, 0.10);
    gunMat.specularColor = new Color3(0.4, 0.4, 0.4);
    gunMat.specularPower = 32;

    const gripMat = new StandardMaterial('gripMat', scene);
    gripMat.diffuseColor  = new Color3(0.08, 0.08, 0.08);
    gripMat.specularColor = new Color3(0.1, 0.1, 0.1);

    // Slide / body — acts as the root; barrel and grip are parented to it
    const gunBody = MeshBuilder.CreateBox('gunBody', { width: 0.044, height: 0.068, depth: 0.21 }, scene);
    gunBody.material   = gunMat;
    gunBody.isPickable = false;

    // Barrel — parented to gunBody; local +Z = forward along barrel
    const gunBarrel = MeshBuilder.CreateBox('gunBarrel', { width: 0.024, height: 0.024, depth: 0.10 }, scene);
    gunBarrel.material   = gunMat;
    gunBarrel.isPickable = false;
    gunBarrel.parent     = gunBody;
    gunBarrel.position.set(0, 0.022, 0.155); // forward and slightly above body centre

    // Grip — parented to gunBody; hangs below the rear of the slide
    const gunGrip = MeshBuilder.CreateBox('gunGrip', { width: 0.038, height: 0.09, depth: 0.056 }, scene);
    gunGrip.material   = gripMat;
    gunGrip.isPickable = false;
    gunGrip.parent     = gunBody;
    gunGrip.position.set(0, -0.08, -0.04);
    gunGrip.rotation.x = 0.18; // slight forward angle on the grip

    // ── Infinite dungeon — rooms generated on-demand as player explores ────
    // roomsBuilt stores each room's opening flags once decided.
    // When a neighbour already exists its shared wall decision is honoured,
    // guaranteeing walls are always consistent on both sides.
    type RoomFlags = { n: boolean; s: boolean; e: boolean; w: boolean };
    const roomsBuilt = new Map<string, RoomFlags>();

    const allDisposables: any[] = [];
    const allEnemies: EnemyData[] = [];
    const allLights: CeilingLightData[] = [];
    const roomsMeshed = new Set<string>();
    const buildQueue: Array<[number, number]> = [];

    // Register wall-collision flags immediately (cheap) without building geometry.
    // Flags must exist before the player can reach a room so isWall works correctly.
    const registerFlags = (gx: number, gz: number): void => {
      const key = `${gx},${gz}`;
      if (roomsBuilt.has(key)) return;
      const nbN = roomsBuilt.get(`${gx},${gz + 1}`);
      const nbS = roomsBuilt.get(`${gx},${gz - 1}`);
      const nbE = roomsBuilt.get(`${gx + 1},${gz}`);
      const nbW = roomsBuilt.get(`${gx - 1},${gz}`);
      let n = nbN ? nbN.s : Math.random() < 0.65;
      let s = nbS ? nbS.n : Math.random() < 0.65;
      let e = nbE ? nbE.w : Math.random() < 0.65;
      let w = nbW ? nbW.e : Math.random() < 0.65;
      if (!n && !s && !e && !w) {
        const sides = ['n', 's', 'e', 'w'] as const;
        const pick = sides[Math.floor(Math.random() * 4)];
        if (pick === 'n') n = true;
        else if (pick === 's') s = true;
        else if (pick === 'e') e = true;
        else w = true;
      }
      roomsBuilt.set(key, { n, s, e, w });
    };

    // Queue a room for deferred geometry building (1 per frame via buildNextQueued).
    const ensureRoom = (gx: number, gz: number): void => {
      registerFlags(gx, gz);
      const key = `${gx},${gz}`;
      if (!roomsMeshed.has(key) && !buildQueue.some(([x, z]) => x === gx && z === gz))
        buildQueue.push([gx, gz]);
    };

    // Called once per frame from the render loop — builds one room from the queue.
    const buildNextQueued = (): void => {
      while (buildQueue.length > 0) {
        const [gx, gz] = buildQueue.shift()!;
        const key = `${gx},${gz}`;
        if (roomsMeshed.has(key)) continue;
        roomsMeshed.add(key);
        const f = roomsBuilt.get(key)!;
        const roomIdx = roomsMeshed.size;
        const { enemies, lights, disposables } = buildRoom(scene, gx, gz, f.n, f.s, f.e, f.w, roomIdx, avatarPool);
        allDisposables.push(...disposables);
        allEnemies.push(...enemies);
        allLights.push(...lights);
        return; // one room per frame — come back next tick
      }
    };

    // Grid-based collision — true if world point (px,pz) is inside a wall
    const isWall = (px: number, pz: number): boolean => {
      const gx = Math.floor(px / RS);
      const gz = Math.floor(pz / RS);
      const cell = roomsBuilt.get(`${gx},${gz}`);
      if (!cell) return true;
      const lx = px - gx * RS;
      const lz = pz - gz * RS;
      if (lx < WT && !cell.w) return true;
      if (lx > RS - WT && !cell.e) return true;
      if (lz < WT && !cell.s) return true;
      if (lz > RS - WT && !cell.n) return true;
      return false;
    };

    // Build spawn room synchronously so the player has geometry immediately.
    registerFlags(0, 0);
    roomsMeshed.add('0,0');
    const sf = roomsBuilt.get('0,0')!;
    { const { enemies, lights, disposables } = buildRoom(scene, 0, 0, sf.n, sf.s, sf.e, sf.w, 1, avatarPool);
      allDisposables.push(...disposables); allEnemies.push(...enemies); allLights.push(...lights); }

    fetch('/api/shoot/avatars')
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then((data: { name: string; url: string }[]) => {
        avatarPool = data;
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++) ensureRoom(dx, dz);
      });

    // ── Input ──────────────────────────────────────────────────────────────
    const keys: Record<string, boolean> = {};
    let yaw = 0, pitch = 0;   // yaw=0 → facing +Z (into dungeon)
    camera.rotation.y = yaw;

    // Mouse look — handled manually so we control sensitivity and can clamp
    // movementX/Y to prevent the pointer-lock-acquisition glitch
    let lockGraceUntil = 0;
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      if (performance.now() < lockGraceUntil) return; // ignore first frames after lock
      const mx = Math.max(-80, Math.min(80, e.movementX));
      const my = Math.max(-80, Math.min(80, e.movementY));
      yaw   += mx * 0.002;                                          // right → +yaw (CW in Babylon left-hand)
      pitch  = Math.max(-1.2, Math.min(1.2, pitch + my * 0.002));  // up → negative pitch = look up
      camera.rotation.y = yaw;
      // camera.rotation.x is set each frame in the render loop so recoil offset can be applied
    };

    let flashOn = false;

    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (e.code === 'KeyF') { flashOn = !flashOn; return; }
      if (e.code === 'KeyR' && !reloadRef.current && ammoRef.current < AMMO_MAX) {
        const ctx = getCtx(audioRef); if (ctx) sndReload(ctx);
        reloadRef.current = true; setIsReloading(true);
        setTimeout(() => {
          ammoRef.current = AMMO_MAX; setAmmo(AMMO_MAX);
          reloadRef.current = false; setIsReloading(false);
        }, 2000);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Pointer lock + shoot on click
    const doShoot = () => {
      if (gsRef.current !== 'playing') return;
      if (reloadRef.current) return;
      if (ammoRef.current <= 0) {
        const ctx = getCtx(audioRef); if (ctx) sndEmpty(ctx);
        reloadRef.current = true; setIsReloading(true);
        setTimeout(() => {
          ammoRef.current = AMMO_MAX; setAmmo(AMMO_MAX);
          reloadRef.current = false; setIsReloading(false);
        }, 2000);
        return;
      }
      const ctx = getCtx(audioRef); if (ctx) sndShot(ctx);
      ammoRef.current--; setAmmo(a => a - 1);
      recoilVel    = 10; // gun kick
      camRecoilVel = 4;  // camera pitch kick upward

      // ── Babylon picking — cast ray from screen centre through scene ──────
      // scene.pick() uses display-pixel coordinates; clientWidth/2 = screen centre
      const pick = scene.pick(
        canvas.clientWidth / 2,
        canvas.clientHeight / 2,
        (mesh) => mesh.metadata?.isEnemy === true,
      );

      if (pick?.hit && pick.pickedMesh) {
        const enemy = allEnemies.find(e => e.hitbox === pick.pickedMesh);
        if (enemy && enemy.alive) {
          const ctx2 = getCtx(audioRef); if (ctx2) sndHit(ctx2);
          enemy.hp--;
          enemy.hit = true; enemy.hitTime = performance.now();
          enemy.mat.emissiveColor = new Color3(1, 1, 1);
          if (enemy.hp <= 0) {
            enemy.alive = false;
            enemy.root.setEnabled(false);
            killsRef.current++; setKills(k => k + 1);
            scoreRef.current += 100; setScore(s => s + 100);
            showFeedback('+100 KILL', '#00ffcc');
            const killCtx = getCtx(audioRef); if (killCtx) sndKill(killCtx);
            setCrosshairHit('kill');
            setTimeout(() => setCrosshairHit(null), 220);
          } else {
            showFeedback('HIT', '#ffee00');
            setCrosshairHit('hit');
            setTimeout(() => setCrosshairHit(null), 150);
          }
        }
      }

      if (ammoRef.current === 0) {
        const rctx = getCtx(audioRef); if (rctx) sndReload(rctx);
        reloadRef.current = true; setIsReloading(true);
        setTimeout(() => {
          ammoRef.current = AMMO_MAX; setAmmo(AMMO_MAX);
          reloadRef.current = false; setIsReloading(false);
        }, 2000);
      }
    };

    scene.onPointerDown = (evt) => {
      if (evt.button !== 0) return;
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
      doShoot();
    };

    const onPLChange = () => {
      const locked = document.pointerLockElement === canvas;
      setPointerLocked(locked);
      if (locked) lockGraceUntil = performance.now() + 150; // ignore first 150ms of input
    };
    document.addEventListener('pointerlockchange', onPLChange);
    // Lock may have been granted before listener attached (requested from button click)
    if (document.pointerLockElement === canvas) {
      setPointerLocked(true);
      lockGraceUntil = performance.now() + 150;
    } else {
      canvas.requestPointerLock();
    }

    // ── Game loop ──────────────────────────────────────────────────────────
    let velY = 0;
    let recoilT   = 0; // gun recoil spring
    let recoilVel = 0;
    let camRecoilT   = 0; // camera pitch kick spring
    let camRecoilVel = 0;
    let bobT         = 0;
    let bobSmooth    = 0;
    let sprintLower  = 0;
    let lastStaminaFlush = 0;

    let lastWarnTime = 0;
    let lastProxBeep = 0;
    const visited = new Set<string>(['0,0']);
    const SPEED = 5; // units per second

    engine.runRenderLoop(() => {
      if (gsRef.current !== 'playing') { scene.render(); return; }

      const dt  = Math.min(engine.getDeltaTime() / 1000, 0.05);
      const now = performance.now();

      // ── Horizontal movement — manual position + grid collision ───────────
      // In Babylon left-hand coords: rotation.y=0 faces +Z, +yaw turns right.
      // forward = (sin(yaw), 0, cos(yaw)), right = (cos(yaw), 0, -sin(yaw))
      const fwd = new Vector3( Math.sin(yaw), 0,  Math.cos(yaw));
      const rgt = new Vector3( Math.cos(yaw), 0, -Math.sin(yaw));
      const mv  = Vector3.Zero();
      if (keys['KeyW'] || keys['ArrowUp'])    mv.addInPlace(fwd);
      if (keys['KeyS'] || keys['ArrowDown'])  mv.subtractInPlace(fwd);
      if (keys['KeyA'] || keys['ArrowLeft'])  mv.subtractInPlace(rgt);
      if (keys['KeyD'] || keys['ArrowRight']) mv.addInPlace(rgt);
      const isMoving    = mv.lengthSquared() > 0;
      const isSprinting = isMoving && (keys['ShiftLeft'] || keys['ShiftRight']) && staminaRef.current > 0;
      if (isMoving) {
        mv.normalize().scaleInPlace(SPEED * (isSprinting ? SPRINT_MULT : 1) * dt);
        const R  = 0.35;
        const cx = camera.position.x, cz = camera.position.z;
        const nx = cx + mv.x, nz = cz + mv.z;
        if (!isWall(nx + R, cz) && !isWall(nx - R, cz)) camera.position.x = nx;
        if (!isWall(camera.position.x, nz + R) && !isWall(camera.position.x, nz - R)) camera.position.z = nz;
      }

      // ── Vertical (jump + gravity, manual y-clamp) ────────────────────────
      velY += GRAV * dt;
      camera.position.y += velY * dt;
      if (camera.position.y <= EYE) {
        camera.position.y = EYE;
        if (keys['Space']) velY = JUMP;
        else velY = 0;
      }
      if (camera.position.y >= RH - 0.3) {
        camera.position.y = RH - 0.3;
        velY = Math.min(0, velY);
      }

      // ── Sprint stamina ────────────────────────────────────────────────────
      if (isSprinting) {
        staminaRef.current = Math.max(0, staminaRef.current - STAMINA_DRAIN * dt);
      } else {
        staminaRef.current = Math.min(STAMINA_MAX, staminaRef.current + STAMINA_REGEN * dt);
      }
      if (now - lastStaminaFlush > 80) {
        lastStaminaFlush = now;
        setStamina(Math.round(staminaRef.current));
      }

      // ── Head bob ──────────────────────────────────────────────────────────
      const targetBobAmp = isMoving ? (isSprinting ? 0.018 : 0.008) : 0;
      bobSmooth += (targetBobAmp - bobSmooth) * Math.min(1, dt * 10);
      if (isMoving) bobT += dt * (isSprinting ? 14 : 9);
      camera.position.y += Math.sin(bobT) * bobSmooth;

      // ── Flashlight — follow camera + subtle flicker ─────────────────────
      const dirX = Math.sin(yaw) * Math.cos(pitch);
      const dirY = -Math.sin(pitch);
      const dirZ = Math.cos(yaw) * Math.cos(pitch);
      const flicker = Math.sin(now * 0.0009) * 0.08
        + Math.sin(now * 0.0031) * 0.04
        + (Math.random() * 0.06 - 0.03);

      flashlight.position.copyFrom(camera.position);
      flashlight.direction.x = dirX;
      flashlight.direction.y = dirY;
      flashlight.direction.z = dirZ;
      flashlight.intensity = flashOn ? 1.4 + flicker : 0;

      // ── Camera pitch recoil spring ────────────────────────────────────────
      camRecoilVel += (-camRecoilT * 30 - camRecoilVel * 10) * dt;
      camRecoilT   += camRecoilVel * dt;
      camRecoilT    = Math.max(0, camRecoilT);
      camera.rotation.x = pitch - camRecoilT * 0.12; // negative = look up in Babylon

      // ── Gun viewmodel ─────────────────────────────────────────────────────
      // Gun recoil spring
      recoilVel += (-recoilT * 28 - recoilVel * 11) * dt;
      recoilT   += recoilVel * dt;
      recoilT    = Math.max(0, recoilT);

      // Horizontal forward and right vectors (yaw only — gun stays level with ground)
      const hfx = Math.sin(yaw);
      const hfz = Math.cos(yaw);
      const rtx = Math.cos(yaw);
      const rtz = -Math.sin(yaw);

      // Gun base position: right of centre, below eye, slightly forward
      // Recoil lifts the grip slightly — the rotation handles the muzzle-rise
      const gx = camera.position.x + rtx * 0.20 + hfx * 0.26;
      const targetLower = isSprinting ? 1.0 : 0.0;
      sprintLower += (targetLower - sprintLower) * Math.min(1, dt * 10);
      const gy = camera.position.y - 0.14 + recoilT * 0.03 - sprintLower * 0.13;
      const gz = camera.position.z + rtz * 0.20 + hfz * 0.26;

      // Only update gunBody — barrel and grip follow as parented children
      // Negative pitch delta = muzzle rotates upward (Babylon: -x = look up)
      gunBody.position.set(gx, gy, gz);
      gunBody.rotation.set(pitch - recoilT * 0.38 + sprintLower * 0.3, yaw, sprintLower * 0.15);

      // ── Track visited rooms + generate ahead ────────────────────────────
      const pgx = Math.floor(camera.position.x / RS);
      const pgz = Math.floor(camera.position.z / RS);
      const rk  = `${pgx},${pgz}`;
      if (!visited.has(rk) && roomsBuilt.has(rk)) {
        visited.add(rk);
        setRoomsVisited(visited.size);
        scoreRef.current += 25; setScore(s => s + 25);
        for (let dx = -3; dx <= 3; dx++)
          for (let dz = -3; dz <= 3; dz++) ensureRoom(pgx + dx, pgz + dz);
      }
      buildNextQueued();

      // ── Enemy AI ────────────────────────────────────────────────────────
      for (const enemy of allEnemies) {
        if (!enemy.alive) continue;

        const toPlayer = camera.position.subtract(enemy.root.position);
        const dist     = toPlayer.length();

        // Freeze-lunge horror movement — snap between frozen and sprinting phases
        if (dist < 14) {
          // Flip phase when timer expires
          if (now >= enemy.phaseUntil) {
            enemy.lunging = !enemy.lunging;
            enemy.phaseUntil = enemy.lunging
              ? now + 150 + Math.random() * 280  // lunge: 150–430 ms burst
              : now + 350 + Math.random() * 600; // freeze: 350–950 ms pause
          }

          if (enemy.lunging) {
            const dir = toPlayer.normalize();
            dir.y = 0;
            // Strafe weave during lunge only — makes the sprint feel erratic
            const strafe = new Vector3(dir.z, 0, -dir.x);
            const sw = Math.sin(now * enemy.strafeFreq + enemy.strafePhase) * enemy.speed * 0.45;
            const move = dir.scale(enemy.speed * 3.8 * dt).addInPlace(strafe.scale(sw * dt));
            // Wall collision — slide along walls (same X/Z split as the player)
            const ER = 0.3;
            const ex = enemy.root.position.x, ez = enemy.root.position.z;
            const nx = ex + move.x, nz = ez + move.z;
            if (!isWall(nx + ER, ez) && !isWall(nx - ER, ez)) enemy.root.position.x = nx;
            const fx = enemy.root.position.x;
            if (!isWall(fx, nz + ER) && !isWall(fx, nz - ER)) enemy.root.position.z = nz;
          }
          // else: frozen — stand completely still
        }

        // Instant kill on contact — use XZ-only distance (camera Y ≠ enemy Y)
        const xzDist = Math.hypot(
          camera.position.x - enemy.root.position.x,
          camera.position.z - enemy.root.position.z,
        );
        if (xzDist < 0.8) {
          const ctx = getCtx(audioRef); if (ctx) sndDamage(ctx);
          hpRef.current = 0;
          setHp(0);
          gsRef.current = 'ended';
          setGameState('ended');
          if (document.pointerLockElement) document.exitPointerLock();
          return;
        }

        // Hit flash recovery
        if (enemy.hit) {
          const elapsed = now - enemy.hitTime;
          if (elapsed > 160) {
            enemy.mat.emissiveColor = Color3.Black();
            enemy.hit = false;
          }
        }
      }

      // ── Ceiling light flicker ────────────────────────────────────────────
      for (const cl of allLights) {
        let intensity: number;
        const t = now * cl.freq + cl.phase;
        if (cl.style === 'dying') {
          // Brief erratic bursts — mostly off
          const burst = Math.sin(t * 9) > 0.75 && Math.random() > 0.35;
          intensity = burst ? cl.base * (0.2 + Math.random() * 0.6) : 0;
        } else {
          // Organic flicker — sum of primes avoids periodicity
          const f = Math.sin(t) * 0.22 + Math.sin(t * 2.7) * 0.11 + Math.sin(t * 0.43) * 0.07;
          intensity = Math.max(0, cl.base * (0.88 + f));
          if (Math.random() < 0.003) intensity = 0; // rare sudden blackout
        }
        const n = cl.base > 0 ? Math.min(1, intensity / cl.base) : 0;
        cl.bulbMat.emissiveColor = new Color3(cl.color.r * n, cl.color.g * n, cl.color.b * n);
      }

      // ── Proximity beep — interval shrinks as nearest enemy closes in ────────
      let minDist = Infinity;
      for (const enemy of allEnemies) {
        if (!enemy.alive) continue;
        const d = camera.position.subtract(enemy.root.position).length();
        if (d < minDist) minDist = d;
      }
      const HEAR_RANGE = 18;
      if (minDist < HEAR_RANGE) {
        const intensity = 1 - minDist / HEAR_RANGE;           // 0 = far, 1 = right on top
        const interval  = 100 + 2400 * (1 - intensity * intensity); // 2500ms → 100ms
        if (now - lastProxBeep > interval) {
          lastProxBeep = now;
          const osc = proxCtx.createOscillator();
          const g   = proxCtx.createGain();
          osc.type            = 'sine';
          osc.frequency.value = 300 + intensity * 900; // 300 Hz far → 1200 Hz close
          g.gain.setValueAtTime(0.25 + intensity * 0.25, proxCtx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, proxCtx.currentTime + 0.07);
          osc.connect(g); g.connect(proxCtx.destination);
          osc.start(proxCtx.currentTime);
          osc.stop(proxCtx.currentTime + 0.08);
        }
      }

      // Warning beep when an enemy is right on top of the player
      const WARN_DIST = 2.5;
      if (minDist < WARN_DIST && now - lastWarnTime > 500) {
        lastWarnTime = now;
        const warnCtx = getCtx(audioRef);
        if (warnCtx) sndWarning(warnCtx);
      }

      // ── Radar ─────────────────────────────────────────────────────────
      const rc = radarRef.current;
      if (rc) {
        const rctx = rc.getContext('2d')!;
        const W = rc.width, H = rc.height, CX = W / 2, CY = H / 2, R = W / 2 - 2;
        rctx.clearRect(0, 0, W, H);

        // Circular background + border
        rctx.beginPath(); rctx.arc(CX, CY, R, 0, Math.PI * 2);
        rctx.fillStyle = 'rgba(4,4,4,0.82)'; rctx.fill();
        rctx.strokeStyle = 'rgba(189,9,24,0.55)'; rctx.lineWidth = 1.5; rctx.stroke();

        // Range rings
        for (const frac of [0.33, 0.67]) {
          rctx.beginPath(); rctx.arc(CX, CY, R * frac, 0, Math.PI * 2);
          rctx.strokeStyle = 'rgba(189,9,24,0.18)'; rctx.lineWidth = 0.8; rctx.stroke();
        }
        // Cross-hairs
        rctx.strokeStyle = 'rgba(189,9,24,0.18)'; rctx.lineWidth = 0.8;
        rctx.beginPath(); rctx.moveTo(CX, CY - R); rctx.lineTo(CX, CY + R); rctx.stroke();
        rctx.beginPath(); rctx.moveTo(CX - R, CY); rctx.lineTo(CX + R, CY); rctx.stroke();

        // Clip subsequent draws to circle
        rctx.save();
        rctx.beginPath(); rctx.arc(CX, CY, R, 0, Math.PI * 2); rctx.clip();

        // Enemy dots — rotated into player-space so forward is always up on radar
        const RADAR_RANGE = 20;
        const scale = R / RADAR_RANGE;
        for (const enemy of allEnemies) {
          if (!enemy.alive) continue;
          const dx = enemy.root.position.x - camera.position.x;
          const dz = enemy.root.position.z - camera.position.z;
          // Project into player-relative axes:
          //   forward = playerFacing · worldVec  → maps to radar UP   (−screenY)
          //   right   = playerRight  · worldVec  → maps to radar RIGHT (+screenX)
          // playerFacing = (sin(yaw), cos(yaw)),  playerRight = (cos(yaw), −sin(yaw))
          const fwd   = dx * Math.sin(yaw) + dz * Math.cos(yaw);
          const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
          if (Math.hypot(fwd, right) > RADAR_RANGE) continue;
          const sx = CX + right * scale;
          const sy = CY - fwd   * scale;
          rctx.beginPath(); rctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
          rctx.fillStyle = enemy.hit ? '#ff8888' : 'rgba(219,0,29,0.95)';
          rctx.fill();
        }

          // Pulsing warning arrows for enemies right on top of the player
          const WARN_DIST = 2.5;
          for (const enemy of allEnemies) {
            if (!enemy.alive) continue;
            const wdx = enemy.root.position.x - camera.position.x;
            const wdz = enemy.root.position.z - camera.position.z;
            if (Math.hypot(wdx, wdz) > WARN_DIST) continue;
            const wfwd   = wdx * Math.sin(yaw) + wdz * Math.cos(yaw);
            const wright = wdx * Math.cos(yaw) - wdz * Math.sin(yaw);
            const mag = Math.hypot(wright, wfwd) || 1;
            const nx =  wright / mag;
            const ny = -wfwd   / mag;
            const arrowSize = 9;
            const edgeX = CX + nx * (R - 10);
            const edgeY = CY + ny * (R - 10);
            const tipX  = edgeX - nx * arrowSize * 1.7;
            const tipY  = edgeY - ny * arrowSize * 1.7;
            const perpX = -ny * arrowSize * 0.8;
            const perpY =  nx * arrowSize * 0.8;
            const pulse = 0.55 + 0.45 * Math.sin(now * 0.018);
            rctx.beginPath();
            rctx.moveTo(tipX, tipY);
            rctx.lineTo(edgeX + perpX, edgeY + perpY);
            rctx.lineTo(edgeX - perpX, edgeY - perpY);
            rctx.closePath();
            rctx.fillStyle = `rgba(255,30,30,${pulse.toFixed(2)})`;
            rctx.fill();
          }

        rctx.restore();

        // Player dot (always dead-centre, drawn outside clip so it's always full)
        rctx.beginPath(); rctx.arc(CX, CY, 3, 0, Math.PI * 2);
        rctx.fillStyle = '#ffffff'; rctx.fill();
      }

      scene.render();
    });

    // ── Resize ────────────────────────────────────────────────────────────
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      engine.stopRenderLoop();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerlockchange', onPLChange);
      window.removeEventListener('resize', onResize);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      try { humOsc.stop(); } catch {}
      proxCtx.close();
      scene.dispose();
      engine.dispose();
    };
  }, [gameState, showFeedback]);

  // ─── Reset ────────────────────────────────────────────────────────────────

  const resetGame = useCallback(() => {
    hpRef.current = MAX_HP; ammoRef.current = AMMO_MAX; staminaRef.current = STAMINA_MAX;
    killsRef.current = 0; scoreRef.current = 0; reloadRef.current = false;
    setHp(MAX_HP); setAmmo(AMMO_MAX); setStamina(STAMINA_MAX); setKills(0); setScore(0);
    setIsReloading(false); setPointerLocked(false); setFeedback(null); setRoomsVisited(0);
    gsRef.current = 'intro';
    setGameState('intro');
    setTimeout(() => { gsRef.current = 'playing'; setGameState('playing'); }, 50);
  }, []);

  const rating      = score >= 2000 ? 'LEGEND' : score >= 1000 ? 'EXPERT' : score >= 500 ? 'MARKSMAN' : 'RECRUIT';
  const ratingColor = score >= 2000 ? '#ff0055' : score >= 1000 ? '#00ffcc' : score >= 500 ? '#facc15' : '#f87171';

  // ─── UI ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', zIndex: 9999 }}>

      {/* Babylon canvas */}
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', imageRendering: 'pixelated', display: 'block' }} />

      {/* Scanlines */}
      {gameState === 'playing' && (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.14) 3px, rgba(0,0,0,0.14) 4px)' }} />
      )}

      {/* ── INTRO ── */}
      {gameState === 'intro' && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, background: 'rgba(0,0,0,0.9)' }}>
          <div style={{ border: '1px solid rgba(0,255,204,0.3)', padding: '48px 56px', maxWidth: 480, width: '90%', textAlign: 'center' }}>
            <p style={{ color: '#00ffcc', fontSize: '0.6rem', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 8 }}>CLASSIFIED // EYES ONLY</p>
            <h1 style={{ color: '#ededed', fontSize: '2.2rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>SECTOR ZERO</h1>
            <p style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.75rem', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 32 }}>TUNNEL CLEARANCE PROTOCOL</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32, textAlign: 'left' }}>
              {[['MOVE','WASD'],['SPRINT','SHIFT'],['LOOK','MOUSE'],['JUMP','SPACE'],['SHOOT','CLICK'],['RELOAD','R'],['FLASHLIGHT','F']].map(([a, k]) => (
                <div key={a} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>
                  <span style={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.72rem', letterSpacing: '0.2em' }}>{a}</span>
                  <span style={{ color: '#00ffcc', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.15em', fontFamily: 'monospace' }}>{k}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => { gsRef.current = 'playing'; setGameState('playing'); canvasRef.current?.requestPointerLock(); }}
              style={{ background: 'transparent', border: '1px solid #00ffcc', color: '#00ffcc', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', padding: '12px 32px', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = '#00ffcc'; (e.target as HTMLElement).style.color = '#000'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = '#00ffcc'; }}
            >ENTER SECTOR</button>
          </div>
        </div>
      )}

      {/* ── PLAYING HUD ── */}
      {gameState === 'playing' && (
        <>
          {/* Crosshair / hit-marker */}
          {(() => {
            const locked = pointerLocked;
            const hit    = crosshairHit === 'hit';
            const kill   = crosshairHit === 'kill';
            const color  = kill ? '#ffee00' : hit ? '#ff4444' : locked ? '#00ffcc' : 'rgba(0,255,204,0.3)';
            const gap    = kill ? 7 : hit ? 6 : 3; // px from centre to arm start
            const len    = kill ? 7 : hit ? 6 : 5; // arm length
            const thick  = kill || hit ? 2 : 1;
            const arm = (style: React.CSSProperties) => (
              <div style={{ position: 'absolute', background: color, ...style }} />
            );
            return (
              <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 15 }}>
                <div style={{ position: 'relative', width: 1, height: 1 }}>
                  {/* top */}   {arm({ width: thick, height: len, left: -thick/2, bottom: gap })}
                  {/* bottom */}{arm({ width: thick, height: len, left: -thick/2, top:    gap })}
                  {/* left */}  {arm({ height: thick, width: len, right: gap,    top: -thick/2 })}
                  {/* right */} {arm({ height: thick, width: len, left:  gap,    top: -thick/2 })}
                </div>
              </div>
            );
          })()}

          {/* Reload indicator */}
          {isReloading && (
            <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 15 }}>
              <p style={{
                marginLeft: 32, marginTop: 28,
                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.25em',
                textTransform: 'uppercase', color: 'rgba(237,237,237,0.6)',
                fontFamily: 'monospace', animation: 'reloadBlink 0.5s step-start infinite',
              }}>RELOADING</p>
            </div>
          )}

          {/* Top bar */}
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 15, background: 'linear-gradient(to bottom, rgba(0,0,0,0.72), transparent)' }}>
            <div>
              <p style={{ color: 'rgba(0,255,204,0.45)', fontSize: '0.55rem', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 2 }}>ROOMS</p>
              <p style={{ color: '#00ffcc', fontSize: '1.1rem', fontWeight: 700, fontFamily: 'monospace' }}>{roomsVisited}</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.55rem', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 2 }}>SCORE</p>
              <p style={{ color: '#ededed', fontSize: '1.4rem', fontWeight: 800, fontFamily: 'monospace' }}>{score.toString().padStart(6, '0')}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: 'rgba(255,0,85,0.45)', fontSize: '0.55rem', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 2 }}>KILLS</p>
              <p style={{ color: '#ff0055', fontSize: '1.1rem', fontWeight: 700, fontFamily: 'monospace' }}>{kills}</p>
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 15, background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <p style={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.55rem', letterSpacing: '0.25em', textTransform: 'uppercase' }}>HEALTH</p>
              <div style={{ width: 140, height: 6, background: 'rgba(255,255,255,0.1)' }}>
                <div style={{ height: '100%', width: `${hp}%`, background: hp > 50 ? '#00ffcc' : hp > 25 ? '#ffee00' : '#ff0055', transition: 'width 0.1s, background 0.3s' }} />
              </div>
              <p style={{ color: hp > 50 ? '#00ffcc' : hp > 25 ? '#ffee00' : '#ff0055', fontSize: '0.7rem', fontFamily: 'monospace', fontWeight: 700 }}>{Math.round(hp)} / {MAX_HP}</p>
              <p style={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.55rem', letterSpacing: '0.25em', textTransform: 'uppercase', marginTop: 5 }}>STAMINA</p>
              <div style={{ width: 140, height: 4, background: 'rgba(255,255,255,0.1)' }}>
                <div style={{ height: '100%', width: `${stamina}%`, background: stamina > 50 ? '#facc15' : stamina > 20 ? '#fb923c' : '#ef4444', transition: 'width 0.08s, background 0.3s' }} />
              </div>
            </div>
            {!pointerLocked && (
              <p style={{ color: 'rgba(0,255,204,0.6)', fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase' }}>CLICK TO LOCK MOUSE</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <p style={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.55rem', letterSpacing: '0.25em', textTransform: 'uppercase' }}>{isReloading ? 'RELOADING...' : 'AMMO'}</p>
              <div style={{ display: 'flex', gap: 3 }}>
                {Array.from({ length: AMMO_MAX }).map((_, i) => (
                  <div key={i} style={{ width: 8, height: 18, background: i < ammo ? '#ffee00' : 'rgba(255,255,255,0.08)', transition: 'background 0.1s' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Radar */}
          <canvas
            ref={radarRef}
            width={150} height={150}
            style={{ position: 'fixed', bottom: 88, right: 24, borderRadius: '50%', pointerEvents: 'none', zIndex: 15, imageRendering: 'pixelated' }}
          />

          {feedback && (
            <div key={feedback.key} style={{ position: 'fixed', top: '42%', left: '50%', transform: 'translateX(-50%)', color: feedback.color, fontSize: '1.4rem', fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.15em', textTransform: 'uppercase', pointerEvents: 'none', zIndex: 20, textShadow: `0 0 20px ${feedback.color}` }}>
              {feedback.text}
            </div>
          )}
        </>
      )}

      {/* ── GAME OVER ── */}
      {gameState === 'ended' && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, background: 'rgba(0,0,0,0.92)' }}>
          <div style={{ border: '1px solid rgba(255,0,85,0.4)', padding: '48px 56px', maxWidth: 440, width: '90%', textAlign: 'center' }}>
            <p style={{ color: '#ff0055', fontSize: '0.6rem', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 8 }}>MISSION FAILED</p>
            <h2 style={{ color: '#ededed', fontSize: '1.8rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 32 }}>OPERATOR DOWN</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
              {[
                ['SCORE',  score.toString().padStart(6, '0'), '#ededed'],
                ['KILLS',  kills.toString(),                  '#ff0055'],
                ['ROOMS',  roomsVisited.toString(),            '#00ffcc'],
                ['RATING', rating,                            ratingColor],
              ].map(([label, val, col]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
                  <span style={{ color: 'rgba(237,237,237,0.35)', fontSize: '0.72rem', letterSpacing: '0.2em' }}>{label}</span>
                  <span style={{ color: col, fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', fontFamily: 'monospace' }}>{val}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => { resetGame(); canvasRef.current?.requestPointerLock(); }}
              style={{ background: 'transparent', border: '1px solid rgba(255,0,85,0.6)', color: '#ff0055', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', padding: '12px 32px', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = '#ff0055'; (e.target as HTMLElement).style.color = '#000'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = '#ff0055'; }}
            >RETRY MISSION</button>
          </div>
        </div>
      )}

    </div>
  );
}
