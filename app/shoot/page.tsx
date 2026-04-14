'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

interface TargetData {
  group: THREE.Group;
  panelPivot: THREE.Group;
  hitbox: THREE.Mesh;
  active: boolean;
  hit: boolean;
  activateTime: number;
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

export default function ShootingRange() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const ammoRef = useRef(10);
  const isReloadingRef = useRef(false);
  const gameStateRef = useRef<'intro' | 'playing' | 'ended'>('intro');
  const hitsRef = useRef(0);
  const shotsRef = useRef(0);
  const scoreRef = useRef(0);

  const [gameState, setGameState] = useState<'intro' | 'playing' | 'ended'>('intro');
  const [score, setScore] = useState(0);
  const [ammo, setAmmo] = useState(10);
  const [timeLeft, setTimeLeft] = useState(60);
  const [hits, setHits] = useState(0);
  const [shots, setShots] = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; color: string; key: number } | null>(null);
  const [pointerLocked, setPointerLocked] = useState(false);

  // Hide navbar, footer, and custom cursor — this page takes the full viewport
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
    if (ammoRef.current <= 0) { startReload(); return; }

    const { raycaster, camera, targets, muzzleLight } = sceneRef.current;

    shotsRef.current++;
    setShots(s => s + 1);
    ammoRef.current--;
    setAmmo(a => a - 1);

    // Muzzle flash
    muzzleLight.intensity = 8;
    if (sceneRef.current.muzzleTimeout) clearTimeout(sceneRef.current.muzzleTimeout);
    sceneRef.current.muzzleTimeout = setTimeout(() => {
      if (sceneRef.current) sceneRef.current.muzzleLight.intensity = 0;
    }, 80);

    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hitboxes = targets.filter(t => t.active && !t.hit).map(t => t.hitbox);
    const intersects = raycaster.intersectObjects(hitboxes, false);

    if (intersects.length > 0) {
      const hitTarget = targets.find(t => t.hitbox === intersects[0].object);
      if (hitTarget) {
        hitTarget.hit = true;
        hitTarget.active = false;
        hitsRef.current++;
        setHits(h => h + 1);
        scoreRef.current += hitTarget.points;
        setScore(s => s + hitTarget.points);
        showFeedback(`+${hitTarget.points} ${hitTarget.distance}`, '#4ade80');
      }
    } else {
      showFeedback('MISS', '#f87171');
    }

    if (ammoRef.current === 0) startReload();
  }, [showFeedback, startReload]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    gameStateRef.current = 'playing';

    const mount = mountRef.current;
    if (!mount) return;

    // --- Scene ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7aa3c8);
    scene.fog = new THREE.FogExp2(0x9ab8cf, 0.006);

    // --- Camera ---
    // Three.js default looks toward -Z; targets are at +Z, so rotate PI to face them
    const camera = new THREE.PerspectiveCamera(72, mount.clientWidth / mount.clientHeight, 0.1, 600);
    camera.position.set(0, 1.7, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = Math.PI;

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    // --- Lighting ---
    const sun = new THREE.DirectionalLight(0xfff0cc, 2.8);
    sun.position.set(40, 100, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 400;
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    scene.add(sun);

    const ambient = new THREE.AmbientLight(0x607080, 1.0);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x7ec8e3, 0x4a5a2a, 0.6);
    scene.add(hemi);

    const muzzleLight = new THREE.PointLight(0xff8800, 0, 3);
    muzzleLight.position.set(0, 0, -0.3);
    camera.add(muzzleLight);
    scene.add(camera);

    // --- Ground ---
    const groundGeo = new THREE.PlaneGeometry(400, 400, 1, 1);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x4e5e28 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Dirt strip (range lane)
    const dirtGeo = new THREE.PlaneGeometry(22, 120);
    const dirtMat = new THREE.MeshLambertMaterial({ color: 0x8a7a5a });
    const dirt = new THREE.Mesh(dirtGeo, dirtMat);
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.set(0, 0.01, 55);
    dirt.receiveShadow = true;
    scene.add(dirt);

    // Lane divider lines
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true });
    [-9, -3, 3, 9].forEach(x => {
      const lineGeo = new THREE.PlaneGeometry(0.12, 115);
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.02, 57);
      scene.add(line);
    });

    // Distance markers
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.6, transparent: true });
    [25, 50, 75, 100].forEach(dist => {
      const markerGeo = new THREE.PlaneGeometry(22, 0.15);
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(0, 0.02, dist);
      scene.add(marker);
    });

    // --- Backstop berm ---
    const bermMat = new THREE.MeshLambertMaterial({ color: 0x7a6a4a });
    const bermGeo = new THREE.BoxGeometry(60, 5, 10);
    const berm = new THREE.Mesh(bermGeo, bermMat);
    berm.position.set(0, 2.5, 110);
    berm.castShadow = true;
    berm.receiveShadow = true;
    scene.add(berm);

    // Berm slope
    const slopeGeo = new THREE.CylinderGeometry(0, 5, 5, 4);
    const slope = new THREE.Mesh(slopeGeo, bermMat);
    slope.rotation.y = Math.PI / 4;
    slope.position.set(0, 0, 104);
    scene.add(slope);

    // --- Shooter position sandbags ---
    const sandbagMat = new THREE.MeshLambertMaterial({ color: 0x8b7a5a });
    const sandbagPositions: [number, number, number, number, number, number][] = [
      [-2.5, 0.25, -3, 1.2, 0.5, 0.5],
      [2.5, 0.25, -3, 1.2, 0.5, 0.5],
      [-2.5, 0.25, -2.5, 1.2, 0.5, 0.5],
      [2.5, 0.25, -2.5, 1.2, 0.5, 0.5],
      [-2.5, 0.7, -3, 1.0, 0.4, 0.4],
      [2.5, 0.7, -3, 1.0, 0.4, 0.4],
    ];
    sandbagPositions.forEach(([x, y, z, w, h, d]) => {
      const sg = new THREE.BoxGeometry(w, h, d);
      const sm = new THREE.Mesh(sg, sandbagMat);
      sm.position.set(x, y, z);
      sm.castShadow = true;
      scene.add(sm);
    });

    // --- Trees (background atmosphere) ---
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
    const foliageMat = new THREE.MeshLambertMaterial({ color: 0x2d4a1a });
    const treePositions = [-30, -20, 15, 25, -35, 30];
    treePositions.forEach((x, i) => {
      const z = 90 + (i % 3) * 8;
      const h = 6 + Math.random() * 4;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, h), trunkMat);
      trunk.position.set(x, h / 2, z);
      trunk.castShadow = true;
      scene.add(trunk);
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 7), foliageMat);
      foliage.position.set(x, h + 2.5, z);
      foliage.castShadow = true;
      scene.add(foliage);
    });

    // --- Helper: build target ---
    const buildTarget = (x: number, z: number, points: number, distLabel: string): TargetData => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);

      // Wooden post
      const postMat = new THREE.MeshLambertMaterial({ color: 0x7a5c18 });
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), postMat);
      post.position.y = 0.75;
      post.castShadow = true;
      group.add(post);

      // Cross brace
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.06), postMat);
      brace.position.y = 1.3;
      group.add(brace);

      // Panel pivot (rotates to show/hide target)
      const panelPivot = new THREE.Group();
      panelPivot.position.y = 1.5;
      panelPivot.rotation.x = -Math.PI / 2; // starts flat (down)
      group.add(panelPivot);

      // Target silhouette (human shape)
      const sil = new THREE.MeshLambertMaterial({ color: 0x111111 });
      const ring = new THREE.MeshLambertMaterial({ color: 0xcc2222 });

      // Legs
      [-0.1, 0.1].forEach(lx => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.38, 0.04), sil);
        leg.position.set(lx, 0.19, 0);
        panelPivot.add(leg);
      });
      // Torso
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.58, 0.04), sil);
      torso.position.set(0, 0.67, 0);
      panelPivot.add(torso);
      // Head
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.21, 0.04), sil);
      head.position.set(0, 1.05, 0);
      panelPivot.add(head);
      // Bullseye ring on torso
      const ring1 = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.12, 12), ring);
      ring1.position.set(0, 0.72, 0.025);
      panelPivot.add(ring1);

      // Invisible hitbox
      const hitboxGeo = new THREE.BoxGeometry(0.55, 1.15, 0.15);
      const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
      hitbox.position.set(0, 0.55, 0);
      panelPivot.add(hitbox);

      scene.add(group);

      return { group, panelPivot, hitbox, active: false, hit: false, activateTime: 0, duration: 3000, points, distance: distLabel };
    };

    // Create targets: close, mid, far
    const targets: TargetData[] = [
      buildTarget(-6, 22, 10, 'CLOSE'),
      buildTarget(3, 22, 10, 'CLOSE'),
      buildTarget(-3, 45, 25, 'MID'),
      buildTarget(6, 42, 25, 'MID'),
      buildTarget(0, 65, 40, 'FAR'),
      buildTarget(-7, 68, 40, 'FAR'),
      buildTarget(4, 88, 60, 'EXTREME'),
    ];

    const raycaster = new THREE.Raycaster();
    const clock = new THREE.Clock();

    sceneRef.current = { scene, camera, renderer, targets, raycaster, clock, animFrameId: 0, muzzleLight, muzzleTimeout: null };

    // --- Input ---
    let yaw = Math.PI; // start facing +Z where targets are
    let pitch = 0;

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw -= e.movementX * 0.0018;
      pitch -= e.movementY * 0.0018;
      // Free horizontal rotation, modest vertical limit
      pitch = Math.max(-0.4, Math.min(0.3, pitch));
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

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyR') startReload();
    };

    const onPointerLockChange = () => {
      setPointerLocked(document.pointerLockElement === renderer.domElement);
    };

    renderer.domElement.addEventListener('click', onCanvasClick);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    // --- Timer ---
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

    // --- Animation loop ---
    let lastActivation = 0;

    const animate = () => {
      sceneRef.current!.animFrameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime() * 1000;

      if (gameStateRef.current === 'playing') {
        // Randomly activate targets
        if (elapsed - lastActivation > 600 + Math.random() * 1000) {
          const inactive = targets.filter(t => !t.active && !t.hit);
          // Keep up to 3 targets active at once
          const active = targets.filter(t => t.active && !t.hit);
          if (inactive.length > 0 && active.length < 3) {
            const t = inactive[Math.floor(Math.random() * inactive.length)];
            t.active = true;
            t.activateTime = elapsed;
            t.duration = 2200 + Math.random() * 2000;
          }
          lastActivation = elapsed;
        }

        targets.forEach(t => {
          const targetRot = t.hit ? Math.PI / 2 : t.active ? 0 : -Math.PI / 2;
          const speed = t.hit ? 0.15 : 0.1;

          if (Math.abs(t.panelPivot.rotation.x - targetRot) > 0.01) {
            t.panelPivot.rotation.x += (targetRot - t.panelPivot.rotation.x) * speed;
          } else {
            t.panelPivot.rotation.x = targetRot;
          }

          // Expire active targets
          if (t.active && !t.hit && elapsed - t.activateTime > t.duration) {
            t.active = false;
          }
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
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

  const resetGame = useCallback(() => {
    ammoRef.current = 10;
    isReloadingRef.current = false;
    hitsRef.current = 0;
    shotsRef.current = 0;
    scoreRef.current = 0;
    setScore(0);
    setAmmo(10);
    setTimeLeft(60);
    setHits(0);
    setShots(0);
    setIsReloading(false);
    setFeedback(null);
    setPointerLocked(false);
    gameStateRef.current = 'playing';
    setGameState('intro');
    setTimeout(() => setGameState('playing'), 50);
  }, []);

  const accuracy = shots > 0 ? Math.round((hits / shots) * 100) : 0;
  const rating = score >= 400 ? 'EXPERT' : score >= 250 ? 'SHARPSHOOTER' : score >= 120 ? 'MARKSMAN' : 'RECRUIT';
  const ratingColor = score >= 400 ? '#4ade80' : score >= 250 ? '#facc15' : score >= 120 ? '#fb923c' : '#f87171';

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', zIndex: 9999 }}>

      {/* Three.js mount */}
      {gameState === 'playing' && (
        <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'crosshair' }} />
      )}

      {/* ───── INTRO ───── */}
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
                { label: 'CLOSE', pts: '10', color: '#4ade80', bg: 'rgba(74,222,128,0.08)' },
                { label: 'MID', pts: '25', color: '#facc15', bg: 'rgba(250,204,21,0.08)' },
                { label: 'FAR', pts: '40', color: '#fb923c', bg: 'rgba(251,146,60,0.08)' },
                { label: 'EXTREME', pts: '60', color: '#f87171', bg: 'rgba(248,113,113,0.08)' },
              ].map(({ label, pts, color, bg }) => (
                <div key={label} style={{ background: bg, border: `1px solid ${color}33`, padding: '8px 4px' }}>
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

      {/* ───── HUD ───── */}
      {gameState === 'playing' && (
        <>
          {/* Crosshair */}
          <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 40 40" style={{ opacity: 0.85 }}>
              <line x1="0" y1="20" x2="15" y2="20" stroke="#4ade80" strokeWidth="1.5" />
              <line x1="25" y1="20" x2="40" y2="20" stroke="#4ade80" strokeWidth="1.5" />
              <line x1="20" y1="0" x2="20" y2="15" stroke="#4ade80" strokeWidth="1.5" />
              <line x1="20" y1="25" x2="20" y2="40" stroke="#4ade80" strokeWidth="1.5" />
              <circle cx="20" cy="20" r="1.5" fill="#4ade80" />
              <circle cx="20" cy="20" r="7" stroke="#4ade80" strokeWidth="0.8" fill="none" opacity="0.4" />
            </svg>
          </div>

          {/* Timer — top center */}
          <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', fontFamily: 'monospace', textAlign: 'center', pointerEvents: 'none' }}>
            <div style={{ color: '#4ade80', fontSize: 10, letterSpacing: '0.2em' }}>TIME REMAINING</div>
            <div style={{ color: timeLeft <= 10 ? '#f87171' : '#fff', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
              {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
            </div>
          </div>

          {/* Score — top right */}
          <div style={{ position: 'fixed', top: 16, right: 20, fontFamily: 'monospace', textAlign: 'right', pointerEvents: 'none' }}>
            <div style={{ color: '#4ade80', fontSize: 10, letterSpacing: '0.2em' }}>SCORE</div>
            <div style={{ color: '#fff', fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{score}</div>
          </div>

          {/* Ammo — bottom right */}
          <div style={{ position: 'fixed', bottom: 28, right: 24, fontFamily: 'monospace', textAlign: 'right', pointerEvents: 'none' }}>
            {isReloading ? (
              <div style={{ color: '#facc15', fontSize: 13, animation: 'pulse 0.8s infinite' }}>
                ↻ RELOADING...
              </div>
            ) : (
              <>
                <div style={{ color: '#4ade80', fontSize: 10, letterSpacing: '0.2em' }}>AMMO</div>
                <div style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>{ammo} / 10</div>
                <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', marginTop: 4 }}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} style={{ width: 6, height: 16, background: i < ammo ? '#4ade80' : '#1f2937', border: '1px solid #374151' }} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Accuracy — bottom left */}
          <div style={{ position: 'fixed', bottom: 28, left: 24, fontFamily: 'monospace', pointerEvents: 'none' }}>
            <div style={{ color: '#4ade80', fontSize: 10, letterSpacing: '0.2em' }}>ACCURACY</div>
            <div style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>{accuracy}%</div>
            <div style={{ color: '#6b7280', fontSize: 11 }}>{hits} / {shots} hits</div>
          </div>

          {/* Click to lock notice */}
          {!pointerLocked && (
            <div style={{ position: 'fixed', bottom: 8, left: '50%', transform: 'translateX(-50%)', color: '#6b7280', fontFamily: 'monospace', fontSize: 11, pointerEvents: 'none', letterSpacing: '0.1em' }}>
              CLICK TO LOCK CURSOR AND ARM WEAPON
            </div>
          )}

          {/* Feedback popup */}
          {feedback && (
            <div
              key={feedback.key}
              style={{
                position: 'fixed',
                top: '40%',
                left: '50%',
                transform: 'translateX(-50%)',
                color: feedback.color,
                fontFamily: 'monospace',
                fontSize: 22,
                fontWeight: 700,
                pointerEvents: 'none',
                textShadow: `0 0 12px ${feedback.color}`,
                letterSpacing: '0.08em',
              }}
            >
              {feedback.text}
            </div>
          )}

          {/* Vignette */}
          <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.45) 100%)' }} />
        </>
      )}

      {/* ───── END SCREEN ───── */}
      {gameState === 'ended' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'linear-gradient(180deg, #0a0f0a 0%, #111a11 100%)' }}>
          <div style={{ border: '1px solid #2d5a2d', padding: '2.5rem', maxWidth: 420, width: '90%', background: 'rgba(0,0,0,0.85)', fontFamily: 'monospace', color: '#fff' }}>
            <div style={{ color: '#4ade80', fontSize: 11, letterSpacing: '0.2em', marginBottom: 8 }}>◈ EXERCISE COMPLETE ◈</div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#86efac', margin: '0 0 20px', letterSpacing: '0.05em' }}>DEBRIEF</h1>

            {[
              { label: 'Final Score', value: String(score), color: '#fff' },
              { label: 'Shots Fired', value: String(shots), color: '#fff' },
              { label: 'Targets Hit', value: String(hits), color: '#fff' },
              { label: 'Accuracy', value: `${accuracy}%`, color: accuracy >= 70 ? '#4ade80' : accuracy >= 40 ? '#facc15' : '#f87171' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1f2937', paddingBottom: 10, marginBottom: 10, fontSize: 14 }}>
                <span style={{ color: '#9ca3af' }}>{label}</span>
                <span style={{ color, fontWeight: 700 }}>{value}</span>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, fontSize: 14 }}>
              <span style={{ color: '#9ca3af' }}>Rating</span>
              <span style={{ color: ratingColor, fontWeight: 700, letterSpacing: '0.1em', fontSize: 16 }}>{rating}</span>
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
