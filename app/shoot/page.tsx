'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

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

const RS    = 8;     // room size in world units (square)
const RH    = 3.5;   // room height
const WT    = 0.6;   // wall thickness
const PR    = 0.3;   // player collision radius
const EYE   = 1.65;  // eye height
const GRAV  = -20;
const JUMP  = 7.5;
const SPEED = 5;
const AMMO_MAX = 10;
const MAX_HP   = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnemyData {
  group: THREE.Group;
  hitbox: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  neonColor: number;
  hp: number;
  alive: boolean;
  hit: boolean;
  hitTime: number;
  speed: number;
}

interface RoomData {
  gx: number; gz: number;
  n: boolean; s: boolean; e: boolean; w: boolean;
  wallBoxes: THREE.Box3[];   // axis-aligned solid walls for collision
  enemies: EnemyData[];
  objects: THREE.Object3D[]; // everything to remove on cleanup
}

// ─── Path generation ─────────────────────────────────────────────────────────

function genPath(count: number): { gx: number; gz: number }[] {
  const path = [{ gx: 0, gz: 0 }];
  const vis  = new Set<string>(['0,0']);
  let gx = 0, gz = 0, dx = 0, dz = 1;

  for (let i = 0; i < count - 1; i++) {
    // Options: straight, left turn, right turn — biased toward straight
    const opts: [number, number][] = [[dx, dz], [-dz, dx], [dz, -dx]];
    if (Math.random() > 0.65) opts.sort(() => Math.random() - 0.5);
    let moved = false;
    for (const [nx, nz] of opts) {
      const ngx = gx + nx, ngz = gz + nz;
      const k = `${ngx},${ngz}`;
      if (!vis.has(k)) {
        vis.add(k); path.push({ gx: ngx, gz: ngz });
        dx = nx; dz = nz; gx = ngx; gz = ngz;
        moved = true; break;
      }
    }
    if (!moved) break;
  }
  return path;
}

// ─── Enemy builder ────────────────────────────────────────────────────────────

function buildEnemy(scene: THREE.Scene, pos: THREE.Vector3, neonColor: number): EnemyData {
  const group = new THREE.Group();
  group.position.copy(pos);
  const mat = new THREE.MeshBasicMaterial({ color: neonColor });

  const part = (w: number, h: number, d: number, px: number, py: number, pz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(px, py, pz); group.add(m);
  };
  part(0.22, 0.5,  0.05, -0.13, 0.25, 0);
  part(0.22, 0.5,  0.05,  0.13, 0.25, 0);
  part(0.58, 0.7,  0.05,  0,    0.82, 0);
  part(0.28, 0.28, 0.05,  0,    1.28, 0);

  // wireframe outline
  const outEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.70, 1.42, 0.06)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 })
  );
  outEdge.position.set(0, 0.68, 0.01); group.add(outEdge);

  // invisible hitbox
  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.42, 0.8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.set(0, 0.68, 0); group.add(hitbox);

  scene.add(group);
  return { group, hitbox, mat, neonColor, hp: 2, alive: true, hit: false, hitTime: 0, speed: 0.9 + Math.random() * 0.7 };
}

// ─── Room builder ─────────────────────────────────────────────────────────────

function buildRoom(
  scene: THREE.Scene,
  gx: number, gz: number,
  n: boolean, s: boolean, e: boolean, w: boolean,
  roomIdx: number
): RoomData {
  const x0 = gx * RS, z0 = gz * RS;
  const wallBoxes: THREE.Box3[] = [];
  const objects: THREE.Object3D[] = [];
  const enemies: EnemyData[] = [];

  // Materials
  const wallMat  = new THREE.MeshBasicMaterial({ color: 0x010d1c });
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x000810 });
  const neonCol  = 0x00ffcc;
  const neonMat  = () => new THREE.LineBasicMaterial({ color: neonCol, transparent: true, opacity: 0.5 });
  const dimMat   = () => new THREE.LineBasicMaterial({ color: 0x002a22, transparent: true, opacity: 0.7 });

  const add = (obj: THREE.Object3D) => { scene.add(obj); objects.push(obj); return obj; };

  // ── Floor ────────────────────────────────────────────────────────────────
  const cx = x0 + RS / 2, cz = z0 + RS / 2;
  const floorGeo = new THREE.PlaneGeometry(RS, RS);
  const floor = add(new THREE.Mesh(floorGeo, floorMat)) as THREE.Mesh;
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.01, cz);

  // floor grid
  const gridGeo = new THREE.PlaneGeometry(RS, RS, RS, RS);
  const grid = add(new THREE.LineSegments(new THREE.EdgesGeometry(gridGeo), dimMat())) as THREE.LineSegments;
  grid.rotation.x = -Math.PI / 2; grid.position.set(cx, 0.02, cz);

  // floor collider (thin slab so jumping doesn't clip through)
  wallBoxes.push(new THREE.Box3(
    new THREE.Vector3(x0, -WT, z0),
    new THREE.Vector3(x0 + RS, 0, z0 + RS)
  ));

  // ── Ceiling ──────────────────────────────────────────────────────────────
  const ceilGeo = new THREE.PlaneGeometry(RS, RS);
  const ceil = add(new THREE.Mesh(ceilGeo, new THREE.MeshBasicMaterial({ color: 0x010a18 }))) as THREE.Mesh;
  ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, RH, cz);
  const ceilEdge = add(new THREE.LineSegments(new THREE.EdgesGeometry(ceilGeo), neonMat())) as THREE.LineSegments;
  ceilEdge.rotation.x = Math.PI / 2; ceilEdge.position.set(cx, RH, cz);

  // ceiling collider
  wallBoxes.push(new THREE.Box3(
    new THREE.Vector3(x0, RH, z0),
    new THREE.Vector3(x0 + RS, RH + WT, z0 + RS)
  ));

  // ── Walls (BoxGeometry = thick, no see-through) ───────────────────────────
  // Corners are filled by overlapping the wall boxes slightly past room edges.
  const addWall = (wcx: number, wcy: number, wcz: number, ww: number, wh: number, wd: number) => {
    const geo = new THREE.BoxGeometry(ww, wh, wd);
    const mesh = add(new THREE.Mesh(geo, wallMat)) as THREE.Mesh;
    mesh.position.set(wcx, wcy, wcz);
    const edge = add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), neonMat())) as THREE.LineSegments;
    edge.position.set(wcx, wcy, wcz);
    // Push this wall into the collision list
    wallBoxes.push(new THREE.Box3(
      new THREE.Vector3(wcx - ww / 2, wcy - wh / 2, wcz - wd / 2),
      new THREE.Vector3(wcx + ww / 2, wcy + wh / 2, wcz + wd / 2)
    ));
  };

  // Extend walls by WT on each perpendicular end so corners are solid.
  const WE = WT; // corner extension
  if (!s) addWall(cx,            RH / 2, z0 + WT / 2,      RS + WE * 2, RH, WT);
  if (!n) addWall(cx,            RH / 2, z0 + RS - WT / 2,  RS + WE * 2, RH, WT);
  if (!w) addWall(x0 + WT / 2,  RH / 2, cz,                WT, RH, RS + WE * 2);
  if (!e) addWall(x0 + RS - WT / 2, RH / 2, cz,            WT, RH, RS + WE * 2);

  // ── Neon ceiling strips ───────────────────────────────────────────────────
  const stripMat = new THREE.LineBasicMaterial({ color: 0x00eedd, transparent: true, opacity: 0.65 });
  const strip = (ax: number, az: number, bx: number, bz: number) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ax, RH - 0.06, az),
      new THREE.Vector3(bx, RH - 0.06, bz),
    ]);
    add(new THREE.Line(geo, stripMat));
  };
  strip(x0 + 0.3, z0 + 0.3, x0 + RS - 0.3, z0 + 0.3);
  strip(x0 + 0.3, z0 + RS - 0.3, x0 + RS - 0.3, z0 + RS - 0.3);

  // ── Obstacles ─────────────────────────────────────────────────────────────
  if (roomIdx >= 2) {
    const obsMat = new THREE.MeshBasicMaterial({ color: 0x001422 });
    const obsEdgeMat = () => new THREE.LineBasicMaterial({ color: 0x0055bb, transparent: true, opacity: 0.7 });
    const obsCount = Math.floor(Math.random() * 3);
    const inner = RS - WT * 2 - 1; // safe spawn area
    for (let i = 0; i < obsCount; i++) {
      const ow = 0.5 + Math.random() * 0.9;
      const oh = 0.6 + Math.random() * 1.4;
      const ox = x0 + WT + 0.5 + Math.random() * inner;
      const oz = z0 + WT + 0.5 + Math.random() * inner;
      const oGeo = new THREE.BoxGeometry(ow, oh, ow);
      const oMesh = add(new THREE.Mesh(oGeo, obsMat)) as THREE.Mesh;
      oMesh.position.set(ox, oh / 2, oz);
      const oEdge = add(new THREE.LineSegments(new THREE.EdgesGeometry(oGeo), obsEdgeMat())) as THREE.LineSegments;
      oEdge.position.set(ox, oh / 2, oz);
      // Obstacles are solid for collision
      wallBoxes.push(new THREE.Box3(
        new THREE.Vector3(ox - ow / 2, 0, oz - ow / 2),
        new THREE.Vector3(ox + ow / 2, oh, oz + ow / 2)
      ));
    }
  }

  // ── Enemies ───────────────────────────────────────────────────────────────
  if (roomIdx >= 2) {
    const enemyCount = Math.floor(Math.random() * 3);
    const neonColors = [0xff0055, 0xff6600, 0xffee00];
    const inner = RS - WT * 2 - 1;
    for (let i = 0; i < enemyCount; i++) {
      const ex = x0 + WT + 0.5 + Math.random() * inner;
      const ez = z0 + WT + 0.5 + Math.random() * inner;
      const col = neonColors[Math.floor(Math.random() * neonColors.length)];
      const enemy = buildEnemy(scene, new THREE.Vector3(ex, 0, ez), col);
      objects.push(enemy.group);
      enemies.push(enemy);
    }
  }

  return { gx, gz, n, s, e, w, wallBoxes, enemies, objects };
}

// ─── Collision: circle vs AABB (horizontal only) ──────────────────────────────

function pushOutWalls(px: number, pz: number, boxes: THREE.Box3[]): { x: number; z: number } {
  let x = px, z = pz;
  for (const box of boxes) {
    // Only test horizontal extent — skip floor/ceiling boxes for horizontal push
    if (box.max.y <= 0 || box.min.y >= RH) continue;

    const nearX = Math.max(box.min.x, Math.min(x, box.max.x));
    const nearZ = Math.max(box.min.z, Math.min(z, box.max.z));
    const dx = x - nearX, dz = z - nearZ;
    const d2 = dx * dx + dz * dz;

    if (d2 < PR * PR) {
      if (d2 < 0.0001) {
        // Player centre is inside — push on shortest axis
        const ox1 = x - box.min.x, ox2 = box.max.x - x;
        const oz1 = z - box.min.z, oz2 = box.max.z - z;
        if (Math.min(ox1, ox2) < Math.min(oz1, oz2))
          x += ox1 < ox2 ? -(ox1 + PR) : (ox2 + PR);
        else
          z += oz1 < oz2 ? -(oz1 + PR) : (oz2 + PR);
      } else {
        const d = Math.sqrt(d2);
        x += (dx / d) * (PR - d);
        z += (dz / d) * (PR - d);
      }
    }
  }
  return { x, z };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DungeonShooter() {
  const mountRef  = useRef<HTMLDivElement>(null);
  const audioRef  = useRef<AudioContext | null>(null);
  const gsRef     = useRef<'intro' | 'playing' | 'ended'>('intro');

  const [gameState, setGameState]     = useState<'intro' | 'playing' | 'ended'>('intro');
  const [score, setScore]             = useState(0);
  const [hp, setHp]                   = useState(MAX_HP);
  const [ammo, setAmmo]               = useState(AMMO_MAX);
  const [kills, setKills]             = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [feedback, setFeedback]       = useState<{ text: string; color: string; key: number } | null>(null);
  const [roomsExplored, setRoomsExplored] = useState(0);

  const scoreRef     = useRef(0);
  const hpRef        = useRef(MAX_HP);
  const ammoRef      = useRef(AMMO_MAX);
  const killsRef     = useRef(0);
  const reloadingRef = useRef(false);

  useEffect(() => {
    document.body.classList.add('fullscreen-page', 'suppress-custom-cursor');
    return () => document.body.classList.remove('fullscreen-page', 'suppress-custom-cursor');
  }, []);

  const showFeedback = useCallback((text: string, color: string) => {
    setFeedback({ text, color, key: Date.now() });
    setTimeout(() => setFeedback(null), 700);
  }, []);

  // ─── Main game effect ──────────────────────────────────────────────────────

  useEffect(() => {
    if (gameState !== 'playing') return;
    gsRef.current = 'playing';

    const mount = mountRef.current;
    if (!mount) return;

    // ── Renderer ──────────────────────────────────────────────────────────
    const PIXEL = 2;
    const rw = Math.floor(mount.clientWidth / PIXEL);
    const rh = Math.floor(mount.clientHeight / PIXEL);
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(rw, rh, false);
    renderer.domElement.style.cssText = 'width:100%;height:100%;image-rendering:pixelated;';
    renderer.toneMapping = THREE.NoToneMapping;
    mount.appendChild(renderer.domElement);

    // ── Scene / camera ────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000508);
    scene.fog = new THREE.FogExp2(0x000508, 0.055);

    const camera = new THREE.PerspectiveCamera(85, mount.clientWidth / mount.clientHeight, 0.05, 80);
    camera.rotation.order = 'YXZ';

    const muzzleLight = new THREE.PointLight(0xff6600, 0, 6);
    muzzleLight.position.set(0, 0, -0.4);
    camera.add(muzzleLight);
    scene.add(camera);
    scene.add(new THREE.AmbientLight(0x0a1a2a, 3));

    // ── Generate dungeon ──────────────────────────────────────────────────
    const path = genPath(22);

    // Determine room connections from path order
    const openMap = new Map<string, { n: boolean; s: boolean; e: boolean; w: boolean }>();
    for (const { gx, gz } of path) openMap.set(`${gx},${gz}`, { n: false, s: false, e: false, w: false });

    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const oa = openMap.get(`${a.gx},${a.gz}`)!;
      const ob = openMap.get(`${b.gx},${b.gz}`)!;
      const ddx = b.gx - a.gx, ddz = b.gz - a.gz;
      if (ddx ===  1) { oa.e = true; ob.w = true; }
      if (ddx === -1) { oa.w = true; ob.e = true; }
      if (ddz ===  1) { oa.n = true; ob.s = true; }
      if (ddz === -1) { oa.s = true; ob.n = true; }
    }

    const rooms: RoomData[] = path.map(({ gx, gz }, idx) => {
      const o = openMap.get(`${gx},${gz}`)!;
      return buildRoom(scene, gx, gz, o.n, o.s, o.e, o.w, idx);
    });

    // All wall boxes for collision
    const allWallBoxes = rooms.flatMap(r => r.wallBoxes);
    // All enemies
    const allEnemies = rooms.flatMap(r => r.enemies);

    // Player starts at centre of first room, facing north (+z)
    camera.position.set(RS / 2, EYE, RS / 2);
    let yaw   = Math.PI; // face +z
    let pitch = 0;
    let velY  = 0;
    camera.rotation.y = yaw;

    // Track which rooms player has entered
    const visitedRooms = new Set<string>(['0,0']);

    // ── Input ────────────────────────────────────────────────────────────
    const keys: Record<string, boolean> = {};

    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (e.code === 'KeyR' && !reloadingRef.current && ammoRef.current < AMMO_MAX) {
        const ctx = getCtx(audioRef); if (ctx) sndReload(ctx);
        reloadingRef.current = true; setIsReloading(true);
        setTimeout(() => {
          ammoRef.current = AMMO_MAX; setAmmo(AMMO_MAX);
          reloadingRef.current = false; setIsReloading(false);
        }, 2000);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw   -= e.movementX * 0.0018;
      pitch -= e.movementY * 0.0018;
      pitch  = Math.max(-1.2, Math.min(1.2, pitch));
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    };

    const onPLChange = () => setPointerLocked(document.pointerLockElement === renderer.domElement);

    const doShoot = () => {
      if (gsRef.current !== 'playing') return;
      if (reloadingRef.current) return;
      if (ammoRef.current <= 0) {
        const ctx = getCtx(audioRef); if (ctx) sndEmpty(ctx);
        reloadingRef.current = true; setIsReloading(true);
        setTimeout(() => {
          ammoRef.current = AMMO_MAX; setAmmo(AMMO_MAX);
          reloadingRef.current = false; setIsReloading(false);
        }, 2000);
        return;
      }
      const ctx = getCtx(audioRef); if (ctx) sndShot(ctx);
      ammoRef.current--; setAmmo(a => a - 1);
      muzzleLight.intensity = 14;
      setTimeout(() => { muzzleLight.intensity = 0; }, 65);

      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const liveHitboxes = allEnemies.filter(e => e.alive).map(e => e.hitbox);
      const hits = ray.intersectObjects(liveHitboxes, false);

      if (hits.length > 0) {
        const enemy = allEnemies.find(e => e.hitbox === hits[0].object);
        if (enemy && enemy.alive) {
          const ctx2 = getCtx(audioRef); if (ctx2) sndHit(ctx2);
          enemy.hp--;
          enemy.hit = true; enemy.hitTime = performance.now();
          enemy.mat.color.set(0xffffff);
          if (enemy.hp <= 0) {
            enemy.alive = false;
            enemy.group.visible = false;
            killsRef.current++; setKills(k => k + 1);
            scoreRef.current += 100; setScore(s => s + 100);
            showFeedback('+100 KILL', '#00ffaa');
          } else {
            showFeedback('HIT', '#ffee00');
          }
        }
      }

      if (ammoRef.current === 0) {
        reloadingRef.current = true; setIsReloading(true);
        setTimeout(() => {
          ammoRef.current = AMMO_MAX; setAmmo(AMMO_MAX);
          reloadingRef.current = false; setIsReloading(false);
        }, 2000);
      }
    };

    const onCanvasClick = () => {
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      } else {
        doShoot();
      }
    };

    renderer.domElement.addEventListener('click', onCanvasClick);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPLChange);

    // ── Animation loop ────────────────────────────────────────────────────
    let prevTime = performance.now();
    let animId = 0;
    let lastDmgSound = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const now = performance.now();
      const dt  = Math.min((now - prevTime) / 1000, 0.05);
      prevTime  = now;

      if (gsRef.current !== 'playing') { renderer.render(scene, camera); return; }

      // ── Player movement ──────────────────────────────────────────────
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const rgt = new THREE.Vector3( Math.cos(yaw), 0, -Math.sin(yaw));
      const mv  = new THREE.Vector3();
      if (keys['KeyW'] || keys['ArrowUp'])    mv.add(fwd);
      if (keys['KeyS'] || keys['ArrowDown'])  mv.sub(fwd);
      if (keys['KeyA'] || keys['ArrowLeft'])  mv.sub(rgt);
      if (keys['KeyD'] || keys['ArrowRight']) mv.add(rgt);
      if (mv.lengthSq() > 0) mv.normalize().multiplyScalar(SPEED * dt);

      // Apply horizontal movement then resolve collisions
      camera.position.x += mv.x;
      camera.position.z += mv.z;
      const resolved = pushOutWalls(camera.position.x, camera.position.z, allWallBoxes);
      camera.position.x = resolved.x;
      camera.position.z = resolved.z;

      // ── Vertical (gravity + jump) ────────────────────────────────────
      velY += GRAV * dt;
      camera.position.y += velY * dt;

      if (camera.position.y <= EYE) {
        camera.position.y = EYE;
        if (keys['Space']) velY = JUMP;
        else velY = 0;
      }
      if (camera.position.y >= RH - 0.25) {
        camera.position.y = RH - 0.25;
        velY = Math.min(0, velY);
      }

      // ── Track rooms visited ──────────────────────────────────────────
      const pgx = Math.floor(camera.position.x / RS);
      const pgz = Math.floor(camera.position.z / RS);
      const rkey = `${pgx},${pgz}`;
      if (!visitedRooms.has(rkey) && openMap.has(rkey)) {
        visitedRooms.add(rkey);
        setRoomsExplored(visitedRooms.size);
        scoreRef.current += 25; setScore(s => s + 25);
      }

      // ── Enemy AI ────────────────────────────────────────────────────
      for (const enemy of allEnemies) {
        if (!enemy.alive) continue;

        // Always face player
        const toPlayer = camera.position.clone().sub(enemy.group.position);
        const distToPlayer = toPlayer.length();
        enemy.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

        // Chase if within range
        if (distToPlayer < 14) {
          const dir = toPlayer.clone().setY(0).normalize();
          enemy.group.position.add(dir.multiplyScalar(enemy.speed * dt));
        }

        // Damage player on contact
        if (distToPlayer < 1.1 && now - lastDmgSound > 500) {
          hpRef.current = Math.max(0, hpRef.current - 15 * dt);
          setHp(Math.round(hpRef.current));
          lastDmgSound = now;
          const ctx = getCtx(audioRef); if (ctx) sndDamage(ctx);
          if (hpRef.current <= 0) {
            gsRef.current = 'ended';
            setGameState('ended');
            if (document.pointerLockElement) document.exitPointerLock();
            return;
          }
        }

        // Hit flash
        if (enemy.hit && enemy.hitTime > 0) {
          const elapsed = now - enemy.hitTime;
          if (elapsed < 160) enemy.mat.color.set(0xffffff);
          else { enemy.mat.color.set(enemy.neonColor); enemy.hit = false; }
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // ── Resize ────────────────────────────────────────────────────────────
    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(Math.floor(mount.clientWidth / PIXEL), Math.floor(mount.clientHeight / PIXEL), false);
    };
    window.addEventListener('resize', onResize);

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId);
      renderer.domElement.removeEventListener('click', onCanvasClick);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPLChange);
      window.removeEventListener('resize', onResize);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      // Dispose all scene objects
      for (const room of rooms) {
        for (const obj of room.objects) {
          scene.remove(obj);
          if ((obj as any).geometry) (obj as any).geometry.dispose();
        }
        for (const e of room.enemies) scene.remove(e.group);
      }
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [gameState, showFeedback]);

  // ─── Reset ────────────────────────────────────────────────────────────────

  const resetGame = useCallback(() => {
    hpRef.current = MAX_HP; ammoRef.current = AMMO_MAX;
    killsRef.current = 0; scoreRef.current = 0;
    reloadingRef.current = false;
    setHp(MAX_HP); setAmmo(AMMO_MAX); setKills(0); setScore(0);
    setIsReloading(false); setPointerLocked(false);
    setFeedback(null); setRoomsExplored(0);
    gsRef.current = 'intro';
    setGameState('intro');
    setTimeout(() => { gsRef.current = 'playing'; setGameState('playing'); }, 50);
  }, []);

  const rating      = score >= 2000 ? 'LEGEND' : score >= 1000 ? 'EXPERT' : score >= 500 ? 'MARKSMAN' : 'RECRUIT';
  const ratingColor = score >= 2000 ? '#ff0055' : score >= 1000 ? '#00ffaa' : score >= 500 ? '#facc15' : '#f87171';

  // ─── UI ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', zIndex: 9999 }}>

      {/* Canvas mount */}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* Scanlines */}
      {gameState === 'playing' && (
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.14) 3px, rgba(0,0,0,0.14) 4px)',
        }} />
      )}

      {/* ── INTRO ── */}
      {gameState === 'intro' && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, background: 'rgba(0,0,0,0.9)' }}>
          <div style={{ border: '1px solid rgba(0,255,204,0.3)', padding: '48px 56px', maxWidth: 480, width: '90%', textAlign: 'center' }}>
            <p style={{ color: '#00ffcc', fontSize: '0.6rem', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 8 }}>CLASSIFIED // EYES ONLY</p>
            <h1 style={{ color: '#ededed', fontSize: '2.2rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>SECTOR ZERO</h1>
            <p style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.75rem', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 32 }}>TUNNEL CLEARANCE PROTOCOL</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32, textAlign: 'left' }}>
              {[['MOVE','WASD'],['LOOK','MOUSE'],['JUMP','SPACE'],['SHOOT','CLICK'],['RELOAD','R']].map(([a,k]) => (
                <div key={a} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>
                  <span style={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.72rem', letterSpacing: '0.2em' }}>{a}</span>
                  <span style={{ color: '#00ffcc', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.15em', fontFamily: 'monospace' }}>{k}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => { gsRef.current = 'playing'; setGameState('playing'); }}
              style={{ background: 'transparent', border: '1px solid #00ffcc', color: '#00ffcc', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', padding: '12px 32px', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background='#00ffcc'; (e.target as HTMLElement).style.color='#000'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background='transparent'; (e.target as HTMLElement).style.color='#00ffcc'; }}
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
              <p style={{ color: '#00ffcc', fontSize: '1.1rem', fontWeight: 700, fontFamily: 'monospace' }}>{roomsExplored}</p>
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
            {/* HP */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <p style={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.55rem', letterSpacing: '0.25em', textTransform: 'uppercase' }}>HEALTH</p>
              <div style={{ width: 140, height: 6, background: 'rgba(255,255,255,0.1)' }}>
                <div style={{ height: '100%', width: `${hp}%`, background: hp > 50 ? '#00ffcc' : hp > 25 ? '#ffee00' : '#ff0055', transition: 'width 0.1s, background 0.3s' }} />
              </div>
              <p style={{ color: hp > 50 ? '#00ffcc' : hp > 25 ? '#ffee00' : '#ff0055', fontSize: '0.7rem', fontFamily: 'monospace', fontWeight: 700 }}>{Math.round(hp)} / {MAX_HP}</p>
            </div>

            {/* Lock prompt */}
            {!pointerLocked && (
              <p style={{ color: 'rgba(0,255,204,0.6)', fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', textAlign: 'center' }}>CLICK TO LOCK MOUSE</p>
            )}

            {/* Ammo */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <p style={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.55rem', letterSpacing: '0.25em', textTransform: 'uppercase' }}>{isReloading ? 'RELOADING...' : 'AMMO'}</p>
              <div style={{ display: 'flex', gap: 3 }}>
                {Array.from({ length: AMMO_MAX }).map((_, i) => (
                  <div key={i} style={{ width: 8, height: 18, background: i < ammo ? '#ffee00' : 'rgba(255,255,255,0.08)', transition: 'background 0.1s' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Hit feedback */}
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
                ['SCORE',  score.toString().padStart(6,'0'), '#ededed'],
                ['KILLS',  kills.toString(),                 '#ff0055'],
                ['ROOMS',  roomsExplored.toString(),         '#00ffcc'],
                ['RATING', rating,                           ratingColor],
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
              onMouseEnter={e => { (e.target as HTMLElement).style.background='#ff0055'; (e.target as HTMLElement).style.color='#000'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background='transparent'; (e.target as HTMLElement).style.color='#ff0055'; }}
            >RETRY MISSION</button>
          </div>
        </div>
      )}

    </div>
  );
}
