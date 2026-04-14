'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TargetData {
  group: THREE.Group;
  panelPivot: THREE.Group;
  hitbox: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  neonColor: number;
  active: boolean;
  hit: boolean;
  hitTime: number;
  activateTime: number;
  wasActiveBefore: boolean;
  duration: number;
  points: number;
  distance: string;
}

interface SceneRefs {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  targets: TargetData[];
  raycaster: THREE.Raycaster;
  clock: THREE.Clock;
  animFrameId: number;
  muzzleLight: THREE.PointLight;
  muzzleTimeout: ReturnType<typeof setTimeout> | null;
}

// ─── Retro Audio (Web Audio API — no files needed) ───────────────────────────

function getCtx(ref: React.MutableRefObject<AudioContext | null>): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ref.current) {
    ref.current = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (ref.current.state === 'suspended') ref.current.resume();
  return ref.current;
}

function sndShot(ctx: AudioContext) {
  const n = Math.floor(ctx.sampleRate * 0.09);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.16));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const flt = ctx.createBiquadFilter();
  flt.type = 'bandpass'; flt.frequency.value = 500; flt.Q.value = 0.6;
  const g = ctx.createGain(); g.gain.value = 1.0;
  src.connect(flt); flt.connect(g); g.connect(ctx.destination);
  src.start();
}

function sndHit(ctx: AudioContext) {
  const t = ctx.currentTime;
  [880, 1108, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square'; osc.frequency.value = freq;
    const at = t + i * 0.065;
    g.gain.setValueAtTime(0.2, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.11);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(at); osc.stop(at + 0.12);
  });
}

function sndMiss(ctx: AudioContext) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.14);
  g.gain.setValueAtTime(0.24, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.15);
}

function sndReload(ctx: AudioContext) {
  const t = ctx.currentTime;
  [261, 329, 392, 523].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square'; osc.frequency.value = freq;
    const at = t + i * 0.13;
    g.gain.setValueAtTime(0.14, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(at); osc.stop(at + 0.1);
  });
}

function sndTargetUp(ctx: AudioContext) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(440, t);
  osc.frequency.linearRampToValueAtTime(880, t + 0.06);
  g.gain.setValueAtTime(0.09, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.09);
}

function sndEmpty(ctx: AudioContext) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'square'; osc.frequency.value = 110;
  g.gain.setValueAtTime(0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.07);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ShootingRange() {
  const mountRef    = useRef<HTMLDivElement>(null);
  const sceneRef    = useRef<SceneRefs | null>(null);
  const audioRef    = useRef<AudioContext | null>(null);
  const ammoRef     = useRef(10);
  const isReloadingRef = useRef(false);
  const gameStateRef   = useRef<'intro' | 'playing' | 'ended'>('intro');
  const hitsRef  = useRef(0);
  const shotsRef = useRef(0);
  const scoreRef = useRef(0);

  const [gameState, setGameState]   = useState<'intro' | 'playing' | 'ended'>('intro');
  const [score, setScore]           = useState(0);
  const [ammo, setAmmo]             = useState(10);
  const [timeLeft, setTimeLeft]     = useState(60);
  const [hits, setHits]             = useState(0);
  const [shots, setShots]           = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [feedback, setFeedback]     = useState<{ text: string; color: string; key: number } | null>(null);
  const [pointerLocked, setPointerLocked] = useState(false);

  // Hide navbar, footer, and custom cursor
  useEffect(() => {
    document.body.classList.add('fullscreen-page', 'suppress-custom-cursor');
    return () => document.body.classList.remove('fullscreen-page', 'suppress-custom-cursor');
  }, []);

  const showFeedback = useCallback((text: string, color: string) => {
    setFeedback({ text, color, key: Date.now() });
    setTimeout(() => setFeedback(null), 700);
  }, []);

  const startReload = useCallback(() => {
    if (isReloadingRef.current) return;
    const ctx = getCtx(audioRef); if (ctx) sndReload(ctx);
    isReloadingRef.current = true;
    setIsReloading(true);
    setTimeout(() => {
      ammoRef.current = 10;
      setAmmo(10);
      isReloadingRef.current = false;
      setIsReloading(false);
    }, 2500);
  }, []);

  const shoot = useCallback(() => {
    if (!sceneRef.current || gameStateRef.current !== 'playing') return;
    if (isReloadingRef.current) return;
    if (ammoRef.current <= 0) {
      const ctx = getCtx(audioRef); if (ctx) sndEmpty(ctx);
      startReload(); return;
    }

    const ctx = getCtx(audioRef); if (ctx) sndShot(ctx);

    const { raycaster, camera, targets, muzzleLight } = sceneRef.current;
    shotsRef.current++;
    setShots(s => s + 1);
    ammoRef.current--;
    setAmmo(a => a - 1);

    // Muzzle flash
    muzzleLight.intensity = 10;
    if (sceneRef.current.muzzleTimeout) clearTimeout(sceneRef.current.muzzleTimeout);
    sceneRef.current.muzzleTimeout = setTimeout(() => {
      if (sceneRef.current) sceneRef.current.muzzleLight.intensity = 0;
    }, 70);

    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hitboxes = targets.filter(t => t.active && !t.hit).map(t => t.hitbox);
    const intersects = raycaster.intersectObjects(hitboxes, false);

    if (intersects.length > 0) {
      const hitTarget = targets.find(t => t.hitbox === intersects[0].object);
      if (hitTarget) {
        hitTarget.hit = true;
        hitTarget.active = false;
        hitTarget.hitTime = performance.now();
        hitTarget.mat.color.set(0xffffff); // flash white on hit
        if (ctx) sndHit(ctx);
        hitsRef.current++;
        setHits(h => h + 1);
        scoreRef.current += hitTarget.points;
        setScore(s => s + hitTarget.points);
        showFeedback(`+${hitTarget.points} ${hitTarget.distance}`, '#00ffaa');
      }
    } else {
      if (ctx) sndMiss(ctx);
      showFeedback('MISS', '#ff4466');
    }

    if (ammoRef.current === 0) startReload();
  }, [showFeedback, startReload]);

  // ─── Three.js Scene ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (gameState !== 'playing') return;
    gameStateRef.current = 'playing';

    const mount = mountRef.current;
    if (!mount) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000812);
    scene.fog = new THREE.FogExp2(0x000812, 0.028);

    // Camera — starts facing +Z (toward targets)
    const camera = new THREE.PerspectiveCamera(80, mount.clientWidth / mount.clientHeight, 0.1, 300);
    camera.position.set(0, 1.7, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = Math.PI;

    // Renderer — pixelated retro look
    const PIXEL = 2; // render at half res then scale up
    const rw = Math.floor(mount.clientWidth / PIXEL);
    const rh = Math.floor(mount.clientHeight / PIXEL);
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(rw, rh, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.imageRendering = 'pixelated';
    renderer.toneMapping = THREE.NoToneMapping;
    mount.appendChild(renderer.domElement);

    // Lighting — minimal, targets are self-lit via MeshBasicMaterial
    const ambient = new THREE.AmbientLight(0x112233, 2.0);
    scene.add(ambient);

    // Muzzle flash — neon orange
    const muzzleLight = new THREE.PointLight(0xff6600, 0, 4);
    muzzleLight.position.set(0, 0, -0.3);
    camera.add(muzzleLight);
    scene.add(camera);

    // ── Ground ──────────────────────────────────────────────────────────────
    const groundGeo = new THREE.PlaneGeometry(120, 120);
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x030b12 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Neon grid — two layers for depth
    const grid1 = new THREE.GridHelper(120, 24, 0x003322, 0x001a11);
    grid1.position.y = 0.01;
    scene.add(grid1);
    const grid2 = new THREE.GridHelper(120, 6, 0x00aa55, 0x00aa55);
    grid2.position.y = 0.02;
    scene.add(grid2);

    // Neon distance markers
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.5 });
    [10, 20, 30, 42].forEach(dist => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(18, 0.1), markerMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.03, dist);
      scene.add(m);
    });

    // Lane edge lines
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.25 });
    [-8, 8].forEach(x => {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 50), edgeMat);
      e.rotation.x = -Math.PI / 2;
      e.position.set(x, 0.03, 25);
      scene.add(e);
    });

    // ── Backstop (wireframe neon box) ────────────────────────────────────────
    const bermGeo = new THREE.BoxGeometry(20, 5, 2);
    const bermEdges = new THREE.EdgesGeometry(bermGeo);
    const bermLine = new THREE.LineSegments(bermEdges, new THREE.LineBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.4 }));
    bermLine.position.set(0, 2.5, 46);
    scene.add(bermLine);

    // Solid berm (very dark, for depth)
    const bermSolid = new THREE.Mesh(bermGeo, new THREE.MeshBasicMaterial({ color: 0x010a10 }));
    bermSolid.position.set(0, 2.5, 46);
    scene.add(bermSolid);

    // ── Decorative pillars (wireframe) ───────────────────────────────────────
    const pillarGeo = new THREE.BoxGeometry(0.3, 4, 0.3);
    const pillarEdges = new THREE.EdgesGeometry(pillarGeo);
    [-9, 9].forEach(x => {
      [10, 22, 34].forEach(z => {
        const p = new THREE.LineSegments(
          pillarEdges,
          new THREE.LineBasicMaterial({ color: 0x004488, transparent: true, opacity: 0.6 })
        );
        p.position.set(x, 2, z);
        scene.add(p);
      });
    });

    // ── Helper: build retro neon target ─────────────────────────────────────
    const buildTarget = (x: number, z: number, points: number, distLabel: string, neonColor: number): TargetData => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);

      // Post — wireframe style
      const postGeo = new THREE.BoxGeometry(0.07, 1.5, 0.07);
      const postEdges = new THREE.EdgesGeometry(postGeo);
      const postLine = new THREE.LineSegments(postEdges, new THREE.LineBasicMaterial({ color: neonColor, transparent: true, opacity: 0.5 }));
      postLine.position.y = 0.75;
      group.add(postLine);

      // Panel pivot
      const panelPivot = new THREE.Group();
      panelPivot.position.y = 1.5;
      panelPivot.rotation.x = -Math.PI / 2;
      group.add(panelPivot);

      // Per-target material (color can be changed on hit)
      const mat = new THREE.MeshBasicMaterial({ color: neonColor });

      // Silhouette parts (share the same material)
      const addPart = (geo: THREE.BufferGeometry, px = 0, py = 0, pz = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(px, py, pz);
        panelPivot.add(m);
      };

      addPart(new THREE.BoxGeometry(0.22, 0.5, 0.05),  -0.13, 0.25);  // leg L
      addPart(new THREE.BoxGeometry(0.22, 0.5, 0.05),   0.13, 0.25);  // leg R
      addPart(new THREE.BoxGeometry(0.58, 0.7, 0.05),   0,    0.82);  // torso
      addPart(new THREE.BoxGeometry(0.28, 0.28, 0.05),  0,    1.28);  // head

      // Wireframe outline over silhouette for extra neon pop
      const outlineGeo = new THREE.BoxGeometry(0.70, 1.42, 0.06);
      const outlineEdges = new THREE.EdgesGeometry(outlineGeo);
      const outline = new THREE.LineSegments(outlineEdges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }));
      outline.position.set(0, 0.68, 0.01);
      panelPivot.add(outline);

      // Invisible hitbox
      const hitbox = new THREE.Mesh(
        new THREE.BoxGeometry(0.70, 1.42, 0.18),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitbox.position.set(0, 0.68, 0);
      panelPivot.add(hitbox);

      scene.add(group);

      return {
        group, panelPivot, hitbox, mat, neonColor,
        active: false, hit: false, hitTime: 0, wasActiveBefore: false,
        activateTime: 0, duration: 3000, points, distance: distLabel,
      };
    };

    const targets: TargetData[] = [
      // CLOSE — z ~8–10
      buildTarget(-5,  8, 10,  'CLOSE',   0x00ffaa),
      buildTarget( 4,  9, 10,  'CLOSE',   0x00ffaa),
      buildTarget( 0, 10, 10,  'CLOSE',   0x00ffaa),
      // MID — z ~18–21
      buildTarget(-5, 19, 25,  'MID',     0xffee00),
      buildTarget( 5, 20, 25,  'MID',     0xffee00),
      buildTarget( 0, 18, 25,  'MID',     0xffee00),
      // FAR — z ~28–32
      buildTarget(-4, 29, 40,  'FAR',     0xff6600),
      buildTarget( 4, 31, 40,  'FAR',     0xff6600),
      // EXTREME — z ~38–42
      buildTarget(-3, 38, 60,  'EXTREME', 0xff0055),
      buildTarget( 3, 41, 60,  'EXTREME', 0xff0055),
    ];

    const raycaster = new THREE.Raycaster();
    const clock     = new THREE.Clock();

    sceneRef.current = { scene, camera, renderer, targets, raycaster, clock, animFrameId: 0, muzzleLight, muzzleTimeout: null };

    // ── Input ────────────────────────────────────────────────────────────────
    let yaw = Math.PI, pitch = 0;

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw   -= e.movementX * 0.0018;
      pitch -= e.movementY * 0.0018;
      pitch  = Math.max(-0.4, Math.min(0.3, pitch));
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    };

    const onCanvasClick = () => {
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      } else {
        shoot();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => { if (e.code === 'KeyR') startReload(); };

    const onPointerLockChange = () => {
      setPointerLocked(document.pointerLockElement === renderer.domElement);
    };

    renderer.domElement.addEventListener('click', onCanvasClick);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    // ── Timer ────────────────────────────────────────────────────────────────
    let timeRemaining = 60;
    const timerInterval = setInterval(() => {
      timeRemaining--;
      setTimeLeft(timeRemaining);
      if (timeRemaining <= 0) {
        clearInterval(timerInterval);
        gameStateRef.current = 'ended';
        setGameState('ended');
        if (document.pointerLockElement) document.exitPointerLock();
      }
    }, 1000);

    // ── Animate ──────────────────────────────────────────────────────────────
    let lastActivation = 0;

    const animate = () => {
      sceneRef.current!.animFrameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime() * 1000;
      const now     = performance.now();

      if (gameStateRef.current === 'playing') {
        // Activate random targets
        if (elapsed - lastActivation > 600 + Math.random() * 900) {
          const inactive = targets.filter(t => !t.active && !t.hit);
          const active   = targets.filter(t =>  t.active && !t.hit);
          if (inactive.length > 0 && active.length < 3) {
            const t = inactive[Math.floor(Math.random() * inactive.length)];
            t.active = true;
            t.activateTime = elapsed;
            t.duration = 2000 + Math.random() * 2000;
            // Play chirp when target pops
            const ctx = getCtx(audioRef); if (ctx) sndTargetUp(ctx);
          }
          lastActivation = elapsed;
        }

        targets.forEach(t => {
          // Hit flash: cycle white → neon for 350ms then go dark, then recycle
          if (t.hit && t.hitTime > 0) {
            const dt = now - t.hitTime;
            if (dt < 350) {
              t.mat.color.set(Math.floor(dt / 60) % 2 === 0 ? 0xffffff : t.neonColor);
            } else if (dt < 800) {
              t.mat.color.set(0x111111); // go dark after flash
            } else {
              // Recycle — target can activate again
              t.hit = false;
              t.hitTime = 0;
              t.mat.color.set(t.neonColor);
            }
          }

          // Rotation animation
          const targetRot = t.hit ? Math.PI / 2 : t.active ? 0 : -Math.PI / 2;
          const speed     = t.hit ? 0.18 : 0.1;
          if (Math.abs(t.panelPivot.rotation.x - targetRot) > 0.01) {
            t.panelPivot.rotation.x += (targetRot - t.panelPivot.rotation.x) * speed;
          } else {
            t.panelPivot.rotation.x = targetRot;
          }

          // Active pulse (subtle scale breathe)
          if (t.active && !t.hit) {
            const pulse = 1 + Math.sin(elapsed * 0.006) * 0.03;
            t.panelPivot.scale.setScalar(pulse);
          } else {
            t.panelPivot.scale.setScalar(1);
          }

          // Expire active targets
          if (t.active && !t.hit && elapsed - t.activateTime > t.duration) {
            t.active = false;
            t.mat.color.set(t.neonColor); // restore color when falling back
          }
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    const onResize = () => {
      if (!mount) return;
      const w = Math.floor(mount.clientWidth / PIXEL);
      const h = Math.floor(mount.clientHeight / PIXEL);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener('resize', onResize);

    return () => {
      clearInterval(timerInterval);
      cancelAnimationFrame(sceneRef.current?.animFrameId ?? 0);
      renderer.domElement.removeEventListener('click', onCanvasClick);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      sceneRef.current = null;
    };
  }, [gameState, shoot, startReload]);

  // ─── Reset ───────────────────────────────────────────────────────────────────

  const resetGame = useCallback(() => {
    ammoRef.current = 10; isReloadingRef.current = false;
    hitsRef.current = 0;  shotsRef.current = 0; scoreRef.current = 0;
    setScore(0); setAmmo(10); setTimeLeft(60);
    setHits(0); setShots(0); setIsReloading(false);
    setFeedback(null); setPointerLocked(false);
    gameStateRef.current = 'playing';
    setGameState('intro');
    setTimeout(() => setGameState('playing'), 50);
  }, []);

  const accuracy    = shots > 0 ? Math.round((hits / shots) * 100) : 0;
  const rating      = score >= 400 ? 'EXPERT' : score >= 250 ? 'SHARPSHOOTER' : score >= 120 ? 'MARKSMAN' : 'RECRUIT';
  const ratingColor = score >= 400 ? '#00ffaa' : score >= 250 ? '#facc15' : score >= 120 ? '#fb923c' : '#f87171';

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', zIndex: 9999 }}>

      {/* ── Three.js canvas ── */}
      {gameState === 'playing' && (
        <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'none' }} />
      )}

      {/* ── Scanline + CRT overlay (only during gameplay) ── */}
      {gameState === 'playing' && (
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.18) 3px, rgba(0,0,0,0.18) 4px)',
        }} />
      )}

      {/* ── INTRO ── */}
      {gameState === 'intro' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'linear-gradient(180deg, #0a0f0a 0%, #111a11 100%)' }}>
          <div style={{ border: '1px solid #2d5a2d', padding: '2.5rem', maxWidth: 420, width: '90%', background: 'rgba(0,0,0,0.85)', fontFamily: 'monospace', color: '#fff' }}>
            <div style={{ color: '#4ade80', fontSize: 11, letterSpacing: '0.2em', marginBottom: 8 }}>◈ CLASSIFIED — TRAINING SIMULATION ◈</div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: '#86efac', margin: '0 0 4px', letterSpacing: '0.05em' }}>SHOOTING RANGE</h1>
            <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 24 }}>Standard qualification exercise — ASOT Training Division</div>
            <div style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.9, marginBottom: 20 }}>
              <div>▸ <span style={{ color: '#9ca3af' }}>Click canvas</span> to lock cursor &amp; arm weapon</div>
              <div>▸ <span style={{ color: '#9ca3af' }}>Mouse</span> to aim | <span style={{ color: '#9ca3af' }}>Left-click</span> to fire</div>
              <div>▸ <span style={{ color: '#9ca3af' }}>[R]</span> to reload — 10 rounds per magazine</div>
              <div>▸ Engage pop-up targets before they drop</div>
              <div>▸ 60 second qualification window</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 24, fontSize: 11, textAlign: 'center' }}>
              {[
                { label: 'CLOSE',   pts: '10', color: '#00ffaa', bg: 'rgba(0,255,170,0.08)'  },
                { label: 'MID',     pts: '25', color: '#ffee00', bg: 'rgba(255,238,0,0.08)'  },
                { label: 'FAR',     pts: '40', color: '#ff6600', bg: 'rgba(255,102,0,0.08)'  },
                { label: 'EXTREME', pts: '60', color: '#ff0055', bg: 'rgba(255,0,85,0.08)'   },
              ].map(({ label, pts, color, bg }) => (
                <div key={label} style={{ background: bg, border: `1px solid ${color}44`, padding: '8px 4px' }}>
                  <div style={{ color }}>{label}</div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{pts}</div>
                  <div style={{ color: '#6b7280' }}>pts</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setGameState('playing')}
              style={{ width: '100%', background: '#166534', border: '1px solid #4ade80', color: '#fff', padding: '12px', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer' }}
            >
              ▶ COMMENCE EXERCISE
            </button>
          </div>
        </div>
      )}

      {/* ── HUD ── */}
      {gameState === 'playing' && (
        <>
          {/* Crosshair */}
          <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
            <svg width="44" height="44" viewBox="0 0 44 44" style={{ opacity: 0.9 }}>
              <line x1="0"  y1="22" x2="16" y2="22" stroke="#00ffaa" strokeWidth="1.5" />
              <line x1="28" y1="22" x2="44" y2="22" stroke="#00ffaa" strokeWidth="1.5" />
              <line x1="22" y1="0"  x2="22" y2="16" stroke="#00ffaa" strokeWidth="1.5" />
              <line x1="22" y1="28" x2="22" y2="44" stroke="#00ffaa" strokeWidth="1.5" />
              <circle cx="22" cy="22" r="2"  fill="#00ffaa" />
              <circle cx="22" cy="22" r="8"  stroke="#00ffaa" strokeWidth="0.8" fill="none" opacity="0.35" />
            </svg>
          </div>

          {/* Timer */}
          <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', fontFamily: 'monospace', textAlign: 'center', pointerEvents: 'none', zIndex: 20 }}>
            <div style={{ color: '#4ade80', fontSize: 10, letterSpacing: '0.2em' }}>TIME</div>
            <div style={{ color: timeLeft <= 10 ? '#ff4466' : '#fff', fontSize: 28, fontWeight: 700, lineHeight: 1, textShadow: timeLeft <= 10 ? '0 0 8px #ff4466' : 'none' }}>
              {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
            </div>
          </div>

          {/* Score */}
          <div style={{ position: 'fixed', top: 16, right: 20, fontFamily: 'monospace', textAlign: 'right', pointerEvents: 'none', zIndex: 20 }}>
            <div style={{ color: '#4ade80', fontSize: 10, letterSpacing: '0.2em' }}>SCORE</div>
            <div style={{ color: '#fff', fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{score}</div>
          </div>

          {/* Ammo */}
          <div style={{ position: 'fixed', bottom: 28, right: 24, fontFamily: 'monospace', textAlign: 'right', pointerEvents: 'none', zIndex: 20 }}>
            {isReloading ? (
              <div style={{ color: '#ffee00', fontSize: 13 }}>↻ RELOADING...</div>
            ) : (
              <>
                <div style={{ color: '#4ade80', fontSize: 10, letterSpacing: '0.2em' }}>AMMO</div>
                <div style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>{ammo} / 10</div>
                <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', marginTop: 4 }}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} style={{ width: 6, height: 16, background: i < ammo ? '#00ffaa' : '#0a1a12', border: '1px solid #003322', boxShadow: i < ammo ? '0 0 4px #00ffaa55' : 'none' }} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Accuracy */}
          <div style={{ position: 'fixed', bottom: 28, left: 24, fontFamily: 'monospace', pointerEvents: 'none', zIndex: 20 }}>
            <div style={{ color: '#4ade80', fontSize: 10, letterSpacing: '0.2em' }}>ACCURACY</div>
            <div style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>{accuracy}%</div>
            <div style={{ color: '#6b7280', fontSize: 11 }}>{hits} / {shots} hits</div>
          </div>

          {/* Lock notice */}
          {!pointerLocked && (
            <div style={{ position: 'fixed', bottom: 8, left: '50%', transform: 'translateX(-50%)', color: '#4ade8066', fontFamily: 'monospace', fontSize: 11, pointerEvents: 'none', letterSpacing: '0.1em', zIndex: 20 }}>
              CLICK TO LOCK CURSOR — [R] RELOAD
            </div>
          )}

          {/* Hit feedback */}
          {feedback && (
            <div key={feedback.key} style={{ position: 'fixed', top: '38%', left: '50%', transform: 'translateX(-50%)', color: feedback.color, fontFamily: 'monospace', fontSize: 24, fontWeight: 700, pointerEvents: 'none', textShadow: `0 0 16px ${feedback.color}`, letterSpacing: '0.1em', zIndex: 20 }}>
              {feedback.text}
            </div>
          )}

          {/* Vignette */}
          <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.6) 100%)', zIndex: 15 }} />
        </>
      )}

      {/* ── END SCREEN ── */}
      {gameState === 'ended' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'linear-gradient(180deg, #0a0f0a 0%, #111a11 100%)' }}>
          <div style={{ border: '1px solid #2d5a2d', padding: '2.5rem', maxWidth: 420, width: '90%', background: 'rgba(0,0,0,0.85)', fontFamily: 'monospace', color: '#fff' }}>
            <div style={{ color: '#4ade80', fontSize: 11, letterSpacing: '0.2em', marginBottom: 8 }}>◈ EXERCISE COMPLETE ◈</div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#86efac', margin: '0 0 20px', letterSpacing: '0.05em' }}>DEBRIEF</h1>
            {[
              { label: 'Final Score',  value: String(score),    color: '#fff'       },
              { label: 'Shots Fired',  value: String(shots),    color: '#fff'       },
              { label: 'Targets Hit',  value: String(hits),     color: '#fff'       },
              { label: 'Accuracy',     value: `${accuracy}%`,   color: accuracy >= 70 ? '#00ffaa' : accuracy >= 40 ? '#facc15' : '#f87171' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1f2937', paddingBottom: 10, marginBottom: 10, fontSize: 14 }}>
                <span style={{ color: '#9ca3af' }}>{label}</span>
                <span style={{ color, fontWeight: 700 }}>{value}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, fontSize: 14 }}>
              <span style={{ color: '#9ca3af' }}>Rating</span>
              <span style={{ color: ratingColor, fontWeight: 700, letterSpacing: '0.1em', fontSize: 16, textShadow: `0 0 8px ${ratingColor}` }}>{rating}</span>
            </div>
            <button
              onClick={resetGame}
              style={{ width: '100%', background: '#166534', border: '1px solid #4ade80', color: '#fff', padding: '12px', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer' }}
            >
              ↩ RUN EXERCISE AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
