import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

// ヒーロー背景の 3D シーン。
// three.js を含むためこのモジュールごと lazy import してコード分割する。

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
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, pointer.x * 0.12, t);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, -pointer.y * 0.08, t);
  });
  return <group ref={ref}>{children}</group>;
}

// 球殻状にばらまいたパーティクル
function ParticleField({ count = 2200 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 5.5 + Math.random() * 9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55;
      arr[i * 3 + 2] = r * Math.cos(phi) - 5;
    }
    return arr;
  }, [count]);

  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.018;
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.25) * 0.15;
  });

  return (
    <Points positions={positions} stride={3} frustumCulled={false} ref={ref}>
      <PointMaterial
        transparent
        color="#7d95ff"
        size={0.045}
        sizeAttenuation
        depthWrite={false}
        opacity={0.65}
      />
    </Points>
  );
}

function Scene() {
  usePointerTracking();
  return (
    <>
      <fog attach="fog" args={['#08090b', 9, 24]} />
      <ambientLight intensity={0.45} />
      <pointLight position={[7, 5, 6]} intensity={120} color="#4a6dff" />
      <pointLight position={[-7, -3, 5]} intensity={90} color="#8b5cf6" />

      <ParallaxGroup>
        <ParticleField />

        <Float speed={1.4} rotationIntensity={0.7} floatIntensity={1.3}>
          <mesh position={[-4.9, 1.5, -2.2]} rotation={[0.4, 0.3, 0]}>
            <torusKnotGeometry args={[1.05, 0.3, 160, 24]} />
            <meshStandardMaterial
              color="#10142c"
              metalness={0.92}
              roughness={0.22}
              emissive="#22367f"
              emissiveIntensity={0.5}
            />
          </mesh>
        </Float>

        <Float speed={1.1} rotationIntensity={0.9} floatIntensity={1.1}>
          <mesh position={[5.1, -0.4, -1.8]}>
            <icosahedronGeometry args={[1.35, 0]} />
            <meshStandardMaterial
              color="#100e24"
              metalness={0.88}
              roughness={0.28}
              emissive="#4c2f8f"
              emissiveIntensity={0.55}
              flatShading
            />
          </mesh>
        </Float>

        <Float speed={1.9} rotationIntensity={1.2} floatIntensity={1.7}>
          <mesh position={[3.5, 2.7, -3.4]}>
            <octahedronGeometry args={[0.6, 0]} />
            <meshBasicMaterial color="#4a6dff" wireframe transparent opacity={0.5} />
          </mesh>
        </Float>

        <Float speed={1.3} rotationIntensity={0.8} floatIntensity={1.2}>
          <mesh position={[-3.7, -2.4, -2.6]} rotation={[1.15, 0.4, 0]}>
            <torusGeometry args={[0.85, 0.018, 12, 72]} />
            <meshBasicMaterial color="#8b5cf6" transparent opacity={0.6} />
          </mesh>
        </Float>

        <Float speed={1.6} rotationIntensity={1} floatIntensity={1.4}>
          <mesh position={[-3.2, 3.3, -4.5]}>
            <tetrahedronGeometry args={[0.45, 0]} />
            <meshBasicMaterial color="#7d95ff" wireframe transparent opacity={0.4} />
          </mesh>
        </Float>
      </ParallaxGroup>
    </>
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
        camera={{ position: [0, 0, 11], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
