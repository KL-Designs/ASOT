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
  const t = ctx.currentTime;
  [880, 1108, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'square'; osc.frequency.value = freq;
    const at = t + i * 0.065;
    g.gain.setValueAtTime(0.2, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.11);
    osc.connect(g); g.connect(ctx.destination); osc.start(at); osc.stop(at + 0.12);
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
const RH      = 3.5;   // room height
const WT      = 0.6;   // wall thickness
const EYE     = 1.65;  // eye height
const GRAV    = -22;
const JUMP    = 8.5;
const PIXEL   = 2;     // render at half-res for retro look
const AMMO_MAX = 10;
const MAX_HP   = 100;

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

// ─── Room builder ─────────────────────────────────────────────────────────────

// diffuse=true → colour responds to lights (walls, floor, obstacles)
// diffuse=false → self-illuminating (enemies, neon accents)
function makeMat(scene: Scene, hex: number, alpha = 1, diffuse = false): StandardMaterial {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8)  & 0xff) / 255;
  const b = ( hex        & 0xff) / 255;
  const mat = new StandardMaterial('m' + Math.random(), scene);
  const col = new Color3(r * alpha, g * alpha, b * alpha);
  if (diffuse) {
    mat.diffuseColor  = col;
    mat.emissiveColor = Color3.Black();
  } else {
    mat.emissiveColor = col;
    mat.diffuseColor  = Color3.Black();
  }
  mat.specularColor = Color3.Black();
  return mat;
}

function buildRoom(
  scene: Scene,
  gx: number, gz: number,
  n: boolean, s: boolean, e: boolean, w: boolean,
  roomIdx: number,
  avatarPool: { name: string; url: string }[]
): { enemies: EnemyData[]; disposables: any[] } {
  const x0 = gx * RS, z0 = gz * RS;
  const cx  = x0 + RS / 2, cz = z0 + RS / 2;
  const disposables: any[] = [];
  const enemies: EnemyData[] = [];

  // Diffuse materials — only lit by the player's flashlight
  const wallMat  = makeMat(scene, 0x2a2826, 1, true);
  const floorMat = makeMat(scene, 0x1c1410, 1, true);
  const ceilMat  = makeMat(scene, 0x1a1a1a, 1, true);

  const neonEdge = new Color4(0.55, 0, 0, 0.18);  // faint blood-red seams
  const edgeW    = 1.5;

  const addWall = (wcx: number, wcy: number, wcz: number, ww: number, wh: number, wd: number, solid = true) => {
    const mesh = MeshBuilder.CreateBox('wall', { width: ww, height: wh, depth: wd }, scene);
    mesh.position = new Vector3(wcx, wcy, wcz);
    mesh.material = wallMat;
    if (solid) mesh.checkCollisions = true;
    mesh.enableEdgesRendering();
    mesh.edgesWidth = edgeW;
    mesh.edgesColor = neonEdge;
    disposables.push(mesh);
    return mesh;
  };

  // ── Floor ────────────────────────────────────────────────────────────────
  const floor = MeshBuilder.CreateGround('floor', { width: RS, height: RS, subdivisions: RS }, scene);
  floor.position = new Vector3(cx, 0, cz);
  floor.material = floorMat;
  floor.enableEdgesRendering();
  floor.edgesWidth = edgeW;
  floor.edgesColor = new Color4(0.35, 0, 0, 0.25);
  disposables.push(floor);

  // ── Ceiling ───────────────────────────────────────────────────────────────
  const ceil = MeshBuilder.CreateGround('ceil', { width: RS, height: RS }, scene);
  ceil.position    = new Vector3(cx, RH, cz);
  ceil.rotation.x  = Math.PI; // flip to face downward
  ceil.material    = ceilMat;
  ceil.enableEdgesRendering();
  ceil.edgesWidth  = edgeW;
  ceil.edgesColor  = neonEdge;
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
      obs.material      = makeMat(scene, 0x252520, 1, true);
      obs.checkCollisions = true;
      obs.enableEdgesRendering();
      obs.edgesWidth    = edgeW;
      obs.edgesColor    = new Color4(0.5, 0, 0, 0.15);
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

  return { enemies, disposables };
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
  const ctx2d = nameTex.getContext();
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

  // Invisible hitbox (the only pickable mesh)
  const hitbox = MeshBuilder.CreateBox('hitbox', { width: 0.9, height: 1.6, depth: 0.5 }, scene);
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

  const scoreRef   = useRef(0);
  const hpRef      = useRef(MAX_HP);
  const ammoRef    = useRef(AMMO_MAX);
  const killsRef   = useRef(0);
  const reloadRef  = useRef(false);

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
    scene.clearColor  = new Color4(0, 0, 0, 1);       // true black void
    scene.fogMode     = Scene.FOGMODE_EXP2;
    scene.fogDensity  = 0.09;                          // thicker — swallows far geometry
    scene.fogColor    = new Color3(0, 0, 0);           // black fog
    scene.collisionsEnabled = true;

    // Negligible ambient — just enough to hint at room shapes beyond flashlight range
    const ambient = new HemisphericLight('amb', new Vector3(0, 1, 0), scene);
    ambient.intensity  = 0.012;
    ambient.diffuse    = new Color3(0.15, 0.05, 0.05); // faint reddish tint

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
    flashlight.diffuse    = new Color3(0.9, 0.8, 0.63);
    flashlight.specular   = new Color3(0.15, 0.12, 0.08);
    flashlight.intensity  = 2.4;
    flashlight.range      = 40;

    // ── Infinite dungeon — rooms generated on-demand as player explores ────
    // roomsBuilt stores each room's opening flags once decided.
    // When a neighbour already exists its shared wall decision is honoured,
    // guaranteeing walls are always consistent on both sides.
    type RoomFlags = { n: boolean; s: boolean; e: boolean; w: boolean };
    const roomsBuilt = new Map<string, RoomFlags>();

    const allDisposables: any[] = [];
    const allEnemies: EnemyData[] = [];

    const ensureRoom = (gx: number, gz: number): void => {
      const key = `${gx},${gz}`;
      if (roomsBuilt.has(key)) return;

      // Respect any already-built neighbours so shared walls always agree
      const nbN = roomsBuilt.get(`${gx},${gz + 1}`);
      const nbS = roomsBuilt.get(`${gx},${gz - 1}`);
      const nbE = roomsBuilt.get(`${gx + 1},${gz}`);
      const nbW = roomsBuilt.get(`${gx - 1},${gz}`);

      // 65 % chance of an opening on each free side; guarantee ≥1 opening
      let n = nbN ? nbN.s : Math.random() < 0.65;
      let s = nbS ? nbS.n : Math.random() < 0.65;
      let e = nbE ? nbE.w : Math.random() < 0.65;
      let w = nbW ? nbW.e : Math.random() < 0.65;
      if (!n && !s && !e && !w) {
        // Force a random side open so rooms are never dead-end islands
        const sides = ['n', 's', 'e', 'w'] as const;
        const pick = sides[Math.floor(Math.random() * 4)];
        if (pick === 'n') n = true;
        else if (pick === 's') s = true;
        else if (pick === 'e') e = true;
        else w = true;
      }

      const flags: RoomFlags = { n, s, e, w };
      roomsBuilt.set(key, flags);

      const roomIdx = roomsBuilt.size;
      const { enemies, disposables } = buildRoom(scene, gx, gz, n, s, e, w, roomIdx, avatarPool);
      allDisposables.push(...disposables);
      allEnemies.push(...enemies);
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

    // Build the spawn room immediately (roomIdx=1, no enemies) so the player
    // has geometry to stand on; then fetch avatars and build the rest of the
    // starting area once the pool is ready so enemies always get real textures.
    ensureRoom(0, 0);

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
      camera.rotation.x = pitch;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
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
          } else {
            showFeedback('HIT', '#ffee00');
          }
        }
      }

      if (ammoRef.current === 0) {
        reloadRef.current = true; setIsReloading(true);
        setTimeout(() => {
          ammoRef.current = AMMO_MAX; setAmmo(AMMO_MAX);
          reloadRef.current = false; setIsReloading(false);
        }, 2000);
      }
    };

    scene.onPointerDown = (evt) => {
      if (evt.button !== 0) return;
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      } else {
        doShoot();
      }
    };

    const onPLChange = () => {
      const locked = document.pointerLockElement === canvas;
      setPointerLocked(locked);
      if (locked) lockGraceUntil = performance.now() + 150; // ignore first 150ms of input
    };
    document.addEventListener('pointerlockchange', onPLChange);

    // ── Game loop ──────────────────────────────────────────────────────────
    let velY = 0;
    let lastDmg = 0;
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
      if (mv.lengthSquared() > 0) {
        mv.normalize().scaleInPlace(SPEED * dt);
        const R  = 0.35; // player collision radius
        const cx = camera.position.x, cz = camera.position.z;
        const nx = cx + mv.x, nz = cz + mv.z;
        // Try X independently (wall-sliding)
        if (!isWall(nx + R, cz) && !isWall(nx - R, cz)) camera.position.x = nx;
        // Try Z independently (wall-sliding)
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
      flashlight.intensity = 2.4 + flicker;

      // ── Track visited rooms + generate ahead ────────────────────────────
      const pgx = Math.floor(camera.position.x / RS);
      const pgz = Math.floor(camera.position.z / RS);
      const rk  = `${pgx},${pgz}`;
      if (!visited.has(rk) && roomsBuilt.has(rk)) {
        visited.add(rk);
        setRoomsVisited(visited.size);
        scoreRef.current += 25; setScore(s => s + 25);
        // Build rooms in a 4-room radius around the player so they never
        // walk into ungenerated space; fog hides anything beyond ~5 rooms
        for (let dx = -4; dx <= 4; dx++)
          for (let dz = -4; dz <= 4; dz++) ensureRoom(pgx + dx, pgz + dz);
      }

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

        // Damage player on contact
        if (dist < 1.1 && now - lastDmg > 200) {
          lastDmg = now;
          hpRef.current = Math.max(0, hpRef.current - 18 * dt);
          setHp(Math.round(hpRef.current));
          const ctx = getCtx(audioRef); if (ctx) sndDamage(ctx);
          if (hpRef.current <= 0) {
            gsRef.current = 'ended';
            setGameState('ended');
            if (document.pointerLockElement) document.exitPointerLock();
            return;
          }
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
      scene.dispose();
      engine.dispose();
    };
  }, [gameState, showFeedback]);

  // ─── Reset ────────────────────────────────────────────────────────────────

  const resetGame = useCallback(() => {
    hpRef.current = MAX_HP; ammoRef.current = AMMO_MAX;
    killsRef.current = 0; scoreRef.current = 0; reloadRef.current = false;
    setHp(MAX_HP); setAmmo(AMMO_MAX); setKills(0); setScore(0);
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
              {[['MOVE','WASD'],['LOOK','MOUSE'],['JUMP','SPACE'],['SHOOT','CLICK'],['RELOAD','R']].map(([a, k]) => (
                <div key={a} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>
                  <span style={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.72rem', letterSpacing: '0.2em' }}>{a}</span>
                  <span style={{ color: '#00ffcc', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.15em', fontFamily: 'monospace' }}>{k}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => { gsRef.current = 'playing'; setGameState('playing'); }}
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
          {/* Crosshair */}
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 15 }}>
            <div style={{ position: 'relative', width: 18, height: 18 }}>
              <div style={{ position: 'absolute', top: '50%', left: 0, width: '100%', height: 1, background: pointerLocked ? '#00ffcc' : 'rgba(0,255,204,0.3)', transform: 'translateY(-50%)' }} />
              <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: pointerLocked ? '#00ffcc' : 'rgba(0,255,204,0.3)', transform: 'translateX(-50%)' }} />
            </div>
          </div>

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
              onClick={resetGame}
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
