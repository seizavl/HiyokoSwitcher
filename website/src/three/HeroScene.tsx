import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// ヒーロー背景の 3D 水面シーン。
// マウスの軌跡・クリック・自動の雫からリップル（波紋）が広がる。
// three.js を含むためこのモジュールごと lazy import してコード分割する。

const MAX_RIPPLES = 14;
const PLANE_Y = -2.3;

// ウィンドウ全体のポインタ位置（-1〜1 正規化）。
// Canvas は pointer-events: none なので自前で window から拾う。
const pointer = { x: 0, y: 0 };

function usePointerTracking() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
}

// マウスに合わせてゆっくり傾くグループ
function ParallaxGroup({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const t = Math.min(delta * 2.5, 1);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, pointer.x * 0.05, t);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, -pointer.y * 0.03, t);
  });
  return <group ref={ref}>{children}</group>;
}

const WATER_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec4 uRipples[${MAX_RIPPLES}];
  varying float vH;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // うねり（アンビエントな波）
    float h = 0.0;
    h += sin(pos.x * 0.45 + uTime * 0.8) * 0.14;
    h += sin(pos.x * 0.21 - pos.y * 0.6 + uTime * 0.55) * 0.12;
    h += sin(pos.y * 0.85 + uTime * 1.15) * 0.07;

    // リップル: 波紋の輪が広がりながら減衰する
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 r = uRipples[i];
      float age = uTime - r.z;
      if (age > 0.0 && age < 5.0) {
        float d = distance(pos.xy, r.xy);
        float delta = d - age * 2.4;
        h += cos(delta * 5.5) * exp(-delta * delta * 1.4) * exp(-age * 1.15) * r.w;
      }
    }

    pos.z += h;
    vH = h;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const WATER_FRAGMENT = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uCrest;
  varying float vH;
  varying vec2 vUv;

  void main() {
    // 端をフェードして背景に溶かす（uv.y=1 が遠端）
    float edgeX = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
    float edgeY = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.7, vUv.y);

    vec3 col = mix(uDeep, uCrest, smoothstep(-0.15, 0.55, vH));
    float alpha = (0.3 + smoothstep(0.0, 0.6, vH) * 0.6) * edgeX * edgeY;
    gl_FragColor = vec4(col, alpha);
  }
`;

// 波紋の広がる水面（ワイヤーフレームのシェーダーメッシュ）
function WaterPlane() {
  const { camera } = useThree();
  const rippleIndex = useRef(0);
  const timeRef = useRef(0);
  const nextDropAt = useRef(0.8);
  const lastTrail = useRef({ x: 0, y: 0, t: -1 });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRipples: {
        value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -10, 0)),
      },
      uDeep: { value: new THREE.Color('#1a2a63') },
      uCrest: { value: new THREE.Color('#63d8ff') },
    }),
    []
  );

  // プレーンローカル座標（x, y）で波紋を追加。ワールド座標は x=wx, y=-wz。
  const addRipple = (x: number, y: number, strength: number) => {
    const v = uniforms.uRipples.value[rippleIndex.current % MAX_RIPPLES];
    v.set(x, y, timeRef.current, strength);
    rippleIndex.current++;
  };

  // ポインタのレイを y=PLANE_Y の水面に落として波紋を発生させる
  useEffect(() => {
    const ndc = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();

    const worldToLocal = (e: PointerEvent): { x: number; y: number } | null => {
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const { origin, direction } = raycaster.ray;
      if (Math.abs(direction.y) < 1e-4) return null;
      const t = (PLANE_Y - origin.y) / direction.y;
      if (t <= 0) return null;
      const wx = origin.x + direction.x * t;
      const wz = origin.z + direction.z * t;
      return { x: wx, y: -(wz - -4) }; // プレーンは z=-4 に配置
    };

    const onMove = (e: PointerEvent) => {
      const p = worldToLocal(e);
      if (!p) return;
      const last = lastTrail.current;
      const dist = Math.hypot(p.x - last.x, p.y - last.y);
      if (dist > 1.1 || timeRef.current - last.t > 0.35) {
        addRipple(p.x, p.y, 0.35);
        lastTrail.current = { x: p.x, y: p.y, t: timeRef.current };
      }
    };

    const onDown = (e: PointerEvent) => {
      const p = worldToLocal(e);
      if (p) addRipple(p.x, p.y, 1.2);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    timeRef.current = t;
    uniforms.uTime.value = t;

    // 一定間隔でランダムな位置に雫を落とす
    if (t >= nextDropAt.current) {
      addRipple(
        THREE.MathUtils.randFloatSpread(20),
        THREE.MathUtils.randFloat(-4, 10),
        THREE.MathUtils.randFloat(0.4, 0.9)
      );
      nextDropAt.current = t + THREE.MathUtils.randFloat(1.2, 2.6);
    }
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, PLANE_Y, -4]}>
      <planeGeometry args={[46, 30, 150, 100]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={WATER_VERTEX}
        fragmentShader={WATER_FRAGMENT}
        wireframe
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// 水中から立ち上る泡
function Bubbles({ count = 90 }: { count?: number }) {
  const geomRef = useRef<THREE.BufferGeometry>(null);

  const { positions, speeds, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = THREE.MathUtils.randFloatSpread(20);
      positions[i * 3 + 1] = THREE.MathUtils.randFloat(PLANE_Y, 4.5);
      positions[i * 3 + 2] = THREE.MathUtils.randFloat(-11, 2);
      speeds[i] = THREE.MathUtils.randFloat(0.25, 0.75);
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, speeds, phases };
  }, [count]);

  // 泡らしいリム発光のスプライトを動的生成
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(0.68, 'rgba(160,214,255,0.16)');
    grad.addColorStop(0.86, 'rgba(170,222,255,0.85)');
    grad.addColorStop(1, 'rgba(170,222,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame((state, delta) => {
    const geom = geomRef.current;
    if (!geom) return;
    const arr = geom.attributes.position.array as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += speeds[i] * delta;
      arr[i * 3] += Math.sin(t * 0.8 + phases[i]) * delta * 0.18;
      if (arr[i * 3 + 1] > 4.8) {
        arr[i * 3 + 1] = PLANE_Y - 0.2;
        arr[i * 3] = THREE.MathUtils.randFloatSpread(20);
        arr[i * 3 + 2] = THREE.MathUtils.randFloat(-11, 2);
      }
    }
    geom.attributes.position.needsUpdate = true;
  });

  return (
    <points>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={texture}
        size={0.22}
        transparent
        opacity={0.75}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        color="#9fd4ff"
        sizeAttenuation
      />
    </points>
  );
}

function Scene() {
  usePointerTracking();
  return (
    <ParallaxGroup>
      <WaterPlane />
      <Bubbles />
    </ParallaxGroup>
  );
}

export default function HeroScene() {
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );
  if (reducedMotion) return null;

  return (
    <div className="hero-canvas" aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 2.4, 11], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ camera }) => camera.lookAt(0, -0.6, 0)}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
