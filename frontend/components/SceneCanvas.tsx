"use client";

/* ============================================================================
   SceneCanvas — a single fixed, full-screen React Three Fiber field that is
   ALWAYS in motion. It fills the whole viewport with a dense engineering
   lattice: drifting point clouds, floating grids, a breathing network of
   threads and slow glass planes.

   It is text-reactive: the page reports the screen rectangles of the visible
   text blocks (via textRectsRef). Points near text are gently pushed away and
   the threads passing through those regions fade out — as if the structure
   "feels" the text and reorganises around it. A soft, slowly drifting blur/
   darkening also floats over the field so the part behind the text stays calm.

   Visual language is unchanged: near-black base, graphite tones, faint cool
   light, thin lines, glass. No bright colours, no gratuitous spinning.
   ========================================================================= */

import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/* Palette in sync with the CSS design tokens */
const COL = {
  line: new THREE.Color("#5f6773"),
  lineBright: new THREE.Color("#cdd6e0"),
  node: new THREE.Color("#aeb8c4"),
  faint: new THREE.Color("#3a4048"),
};

/* Rects are normalised device coords: x,y in [-1,1], w,h half-extents. */
export type TextRect = { x: number; y: number; w: number; h: number };

/* Deterministic PRNG so the field is reproducible (determinism!). */
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------------- */
/* Drifting point cloud + reactive network of threads                         */
/* ------------------------------------------------------------------------- */
function ReactiveField({
  scrollRef,
  textRectsRef,
}: {
  scrollRef: React.MutableRefObject<number>;
  textRectsRef: React.MutableRefObject<TextRect[]>;
}) {
  const { camera } = useThree();

  // World half-extent to cover the screen with margin
  const COUNT = 340;

  const base = useMemo(() => {
    const rng = mulberry32(1337);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < COUNT; i++) {
      pts.push(
        new THREE.Vector3(
          (rng() - 0.5) * 16,
          (rng() - 0.5) * 11,
          (rng() - 0.5) * 6
        )
      );
    }
    return pts;
  }, []);

  // per-point drift phase
  const phase = useMemo(() => {
    const rng = mulberry32(88);
    return base.map(() => ({
      sx: rng() * Math.PI * 2,
      sy: rng() * Math.PI * 2,
      sz: rng() * Math.PI * 2,
      sp: 0.15 + rng() * 0.35,
    }));
  }, [base]);

  // live positions (mutated each frame)
  const live = useMemo(() => base.map((p) => p.clone()), [base]);
  const push = useMemo(() => base.map(() => new THREE.Vector3()), [base]);

  // Points geometry
  const pointsGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3)
    );
    const colors = new Float32Array(COUNT * 3);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);
  const pointsMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.05,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    []
  );

  // Threads geometry (a dynamic line segment buffer, capped)
  const MAX_SEG = 900;
  const linesGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(MAX_SEG * 2 * 3), 3)
    );
    g.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(MAX_SEG * 2 * 3), 3)
    );
    return g;
  }, []);
  const linesMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    []
  );

  const groupRef = useRef<THREE.Group>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const tmpV4 = useMemo(() => new THREE.Vector4(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const scroll = scrollRef.current; // smoothed 0..1
    const rects = textRectsRef.current;

    // Gentle world drift + parallax
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.05) * 0.12 + scroll * 0.4;
      groupRef.current.rotation.x = Math.cos(t * 0.04) * 0.06;
      groupRef.current.position.y = scroll * -2.2;
      groupRef.current.position.x =
        state.pointer.x * 0.4 + Math.sin(t * 0.07) * 0.2;
    }

    const pos = pointsGeo.attributes.position.array as Float32Array;
    const col = pointsGeo.attributes.color.array as Float32Array;

    // project helper: world → NDC
    const project = (v: THREE.Vector3) => {
      tmp.copy(v);
      if (groupRef.current) tmp.applyMatrix4(groupRef.current.matrixWorld);
      tmpV4.set(tmp.x, tmp.y, tmp.z, 1).applyMatrix4(camera.matrixWorldInverse);
      tmpV4.applyMatrix4(camera.projectionMatrix);
      const w = tmpV4.w || 1;
      return { nx: tmpV4.x / w, ny: tmpV4.y / w };
    };

    // update live positions: drift + repulsion away from text rects
    for (let i = 0; i < COUNT; i++) {
      const b = base[i];
      const ph = phase[i];
      // continuous floating
      const dx = Math.sin(t * ph.sp + ph.sx) * 0.5;
      const dy = Math.cos(t * ph.sp * 0.9 + ph.sy) * 0.45;
      const dz = Math.sin(t * ph.sp * 0.7 + ph.sz) * 0.4;
      const target = live[i];
      target.set(b.x + dx, b.y + dy, b.z + dz);

      // text repulsion — measured in screen space
      push[i].multiplyScalar(0.86); // ease back
      if (rects.length) {
        const { nx, ny } = project(target);
        for (let r = 0; r < rects.length; r++) {
          const rc = rects[r];
          const ex = rc.w + 0.16;
          const ey = rc.h + 0.16;
          const ddx = nx - rc.x;
          const ddy = ny - rc.y;
          if (Math.abs(ddx) < ex && Math.abs(ddy) < ey) {
            // inside influence: push outward in screen plane
            const fx = (ex - Math.abs(ddx)) / ex;
            const fy = (ey - Math.abs(ddy)) / ey;
            const f = Math.min(fx, fy);
            const sign = ddx === 0 ? 1 : Math.sign(ddx);
            const signY = ddy === 0 ? 1 : Math.sign(ddy);
            push[i].x += sign * f * 1.9;
            push[i].y += signY * f * 1.4;
          }
        }
      }
      target.add(push[i]);

      pos[i * 3] = target.x;
      pos[i * 3 + 1] = target.y;
      pos[i * 3 + 2] = target.z;

      // colour: fade points that are being pushed (near text) → calmer
      const strength = Math.min(1, push[i].length() * 0.9);
      const c = i % 11 === 0 ? COL.lineBright : COL.node;
      const dim = 1 - strength * 0.85;
      col[i * 3] = c.r * dim;
      col[i * 3 + 1] = c.g * dim;
      col[i * 3 + 2] = c.b * dim;
    }
    pointsGeo.attributes.position.needsUpdate = true;
    pointsGeo.attributes.color.needsUpdate = true;

    // rebuild threads between nearby points, skipping those pushed by text
    const lp = linesGeo.attributes.position.array as Float32Array;
    const lc = linesGeo.attributes.color.array as Float32Array;
    let seg = 0;
    const maxDist = 1.9;
    for (let i = 0; i < COUNT && seg < MAX_SEG; i++) {
      if (push[i].lengthSq() > 0.25) continue; // near text → no threads
      const a = live[i];
      for (let j = i + 1; j < COUNT && seg < MAX_SEG; j++) {
        if (push[j].lengthSq() > 0.25) continue;
        const bpt = live[j];
        const dsq =
          (a.x - bpt.x) * (a.x - bpt.x) +
          (a.y - bpt.y) * (a.y - bpt.y) +
          (a.z - bpt.z) * (a.z - bpt.z);
        if (dsq < maxDist * maxDist) {
          const o = seg * 6;
          lp[o] = a.x; lp[o + 1] = a.y; lp[o + 2] = a.z;
          lp[o + 3] = bpt.x; lp[o + 4] = bpt.y; lp[o + 5] = bpt.z;
          const fade = 1 - Math.sqrt(dsq) / maxDist;
          const cc = (i + j) % 13 === 0 ? COL.lineBright : COL.line;
          const m = 0.25 + fade * 0.75;
          lc[o] = cc.r * m; lc[o + 1] = cc.g * m; lc[o + 2] = cc.b * m;
          lc[o + 3] = cc.r * m; lc[o + 4] = cc.g * m; lc[o + 5] = cc.b * m;
          seg++;
        }
      }
    }
    // clear remaining
    for (let s = seg; s < MAX_SEG; s++) {
      const o = s * 6;
      lp[o] = lp[o + 1] = lp[o + 2] = 0;
      lp[o + 3] = lp[o + 4] = lp[o + 5] = 0;
    }
    linesGeo.setDrawRange(0, seg * 2);
    linesGeo.attributes.position.needsUpdate = true;
    linesGeo.attributes.color.needsUpdate = true;
  });

  return (
    <group ref={groupRef}>
      <points geometry={pointsGeo} material={pointsMat} />
      <lineSegments geometry={linesGeo} material={linesMat} />
      <FloatingGrids scrollRef={scrollRef} />
      <GlassPlanes scrollRef={scrollRef} />
    </group>
  );
}

/* ------------------------------------------------------------------------- */
/* Floating engineering grids (several wireframe planes always drifting)      */
/* ------------------------------------------------------------------------- */
function FloatingGrids({
  scrollRef,
}: {
  scrollRef: React.MutableRefObject<number>;
}) {
  const grids = useMemo(() => {
    const rng = mulberry32(555);
    return Array.from({ length: 5 }).map(() => ({
      pos: new THREE.Vector3(
        (rng() - 0.5) * 12,
        (rng() - 0.5) * 8,
        -2 - rng() * 5
      ),
      rot: new THREE.Euler((rng() - 0.5) * 1.2, (rng() - 0.5) * 1.2, (rng() - 0.5) * 0.6),
      size: 3 + rng() * 4,
      div: 6 + Math.floor(rng() * 6),
      sp: 0.05 + rng() * 0.12,
      ph: rng() * Math.PI * 2,
    }));
  }, []);

  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    grids.forEach((g, i) => {
      const el = refs.current[i];
      if (!el) return;
      el.rotation.x = g.rot.x + Math.sin(t * g.sp + g.ph) * 0.25;
      el.rotation.y = g.rot.y + Math.cos(t * g.sp * 0.8 + g.ph) * 0.3;
      el.position.y = g.pos.y + Math.sin(t * g.sp + g.ph) * 0.6 - scrollRef.current * 1.5;
    });
  });

  return (
    <>
      {grids.map((g, i) => {
        const geo = new THREE.PlaneGeometry(g.size, g.size, g.div, g.div);
        return (
          <group
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            position={g.pos}
            rotation={g.rot}
          >
            <lineSegments>
              <wireframeGeometry args={[geo]} />
              <lineBasicMaterial
                color={COL.faint}
                transparent
                opacity={0.22}
                depthWrite={false}
              />
            </lineSegments>
          </group>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* Slow glass planes drifting in depth                                        */
/* ------------------------------------------------------------------------- */
function GlassPlanes({
  scrollRef,
}: {
  scrollRef: React.MutableRefObject<number>;
}) {
  const planes = useMemo(() => {
    const rng = mulberry32(202);
    return Array.from({ length: 6 }).map(() => ({
      pos: new THREE.Vector3((rng() - 0.5) * 13, (rng() - 0.5) * 9, -3 - rng() * 6),
      rot: new THREE.Euler((rng() - 0.5) * 1.4, (rng() - 0.5) * 1.4, (rng() - 0.5) * 0.8),
      w: 1.4 + rng() * 2.4,
      h: 1 + rng() * 1.8,
      sp: 0.04 + rng() * 0.1,
      ph: rng() * Math.PI * 2,
    }));
  }, []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    planes.forEach((p, i) => {
      const el = refs.current[i];
      if (!el) return;
      el.rotation.x = p.rot.x + Math.sin(t * p.sp + p.ph) * 0.2;
      el.rotation.z = p.rot.z + Math.cos(t * p.sp * 0.7 + p.ph) * 0.15;
      el.position.x = p.pos.x + Math.sin(t * p.sp * 0.6 + p.ph) * 0.5;
    });
  });
  return (
    <>
      {planes.map((p, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={p.pos}
          rotation={p.rot}
        >
          <planeGeometry args={[p.w, p.h]} />
          <meshBasicMaterial
            color={"#11141a"}
            transparent
            opacity={0.22}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* Public component                                                           */
/* ------------------------------------------------------------------------- */
export default function SceneCanvas({
  scrollRef,
  textRectsRef,
}: {
  scrollRef: React.MutableRefObject<number>;
  textRectsRef: React.MutableRefObject<TextRect[]>;
}) {
  return (
    <Canvas
      className="!fixed inset-0"
      style={{ pointerEvents: "none" }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 9], fov: 46 }}
    >
      <ambientLight intensity={0.7} />
      <ReactiveField scrollRef={scrollRef} textRectsRef={textRectsRef} />
    </Canvas>
  );
}
