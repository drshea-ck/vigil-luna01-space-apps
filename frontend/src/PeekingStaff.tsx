/// <reference types="vite/client" />
// Sign-in decoration: four chibi staff peek out from behind the white sign-in panel.
// Presentation only. Reads the `peek` store (pointer / focus events); never touches auth state.
// Rig construction lives in staffRig.ts.
import {Suspense, useEffect, useMemo, useRef, useState} from 'react'
import {Canvas, useFrame, useLoader, useThree} from '@react-three/fiber'
import * as THREE from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {peek} from './peek'
import {buildRig, HIP, modelUrl, Quiet, STAFF, webglAvailable} from './staffRig'

// stage size in CSS px: how far the canvas reaches into the maroon side / over the white side
export const STAGE_LEFT = 210
export const STAGE_RIGHT = 70

// pose constants, in model units (character is ~2 units tall)
const LEAN = 0.6           // radians of sideways lean when fully peeking
const PEEK_X = 0.14        // root sits this far right of the seam when peeking
const HIDDEN_X = 1.05      // root offset when fully hidden behind the panel
const HAND_ALLOW = 0.1     // hands may overlap the white edge by this much
const DEPTH = 700          // px: virtual distance from the characters to the cursor plane
const GRIP = {R: new THREE.Vector3(-0.1, 0.95, 0.3), L: new THREE.Vector3(-0.1, 1.62, 0.3)}
const VIS_CENTER = 1.22    // model-space height of the visible upper body's centre
const LERP = 0.08
const Z = new THREE.Vector3(0, 0, 1)
const HIP_V = new THREE.Vector3(0, HIP, 0)
const clamp = THREE.MathUtils.clamp
const lerp = THREE.MathUtils.lerp

function Character({name, index}: {name: string; index: number}) {
  const gltf = useLoader(GLTFLoader, modelUrl(name))
  const rig = useMemo(() => { const r = buildRig(gltf.scene, name, {clip: true, hideProps: true, shadows: 'hands'}); r.root.visible = false; return r }, [gltf, name])
  const {size, gl} = useThree()
  const spring = useRef({p: 0, v: 0, startAt: -1})
  const tmp = useMemo(() => ({hw: new THREE.Vector3(), t: new THREE.Vector3(), d: new THREE.Vector3(), q: new THREE.Quaternion(), qi: new THREE.Quaternion(), rect: {left: 0, top: 0, width: 0, height: 0}}), [])
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  useFrame((state, delta) => {
    const {root, lean, head, eyes, irises, lids, arms, bodyPlane, handPlane} = rig
    const H = size.height, W = size.width
    const slot = H / STAFF.length
    const s = Math.min(slot / 1.7, 150)
    const seam = STAGE_LEFT - W / 2
    bodyPlane.constant = seam
    handPlane.constant = seam + HAND_ALLOW * s

    // staggered spring pop-out
    const sp = spring.current, now = state.clock.elapsedTime
    if (peek.active && sp.startAt < 0) sp.startAt = now + index * 0.09
    if (!peek.active) sp.startAt = -1
    const goal = peek.active && now >= sp.startAt ? 1 : 0
    if (reduced) { sp.p = goal; sp.v = 0 } else {
      const dt = Math.min(delta, 1 / 30)
      sp.v += (170 * (goal - sp.p) - 16 * sp.v) * dt
      sp.p += sp.v * dt
    }
    const p = sp.p
    root.visible = p > 0.002
    root.scale.setScalar(s)
    root.position.set(seam + lerp(HIDDEN_X, PEEK_X, p) * s, H / 2 - slot * (index + 0.5) - VIS_CENTER * s, 0)
    lean.rotation.z = LEAN * p
    if (!root.visible) return

    // cursor -> look target
    let yaw = 0.45, pitch = 0.05
    if (peek.hasPointer) {
      const r = gl.domElement.getBoundingClientRect()
      const px = peek.clientX - r.left - r.width / 2, py = -(peek.clientY - r.top - r.height / 2)
      head.getWorldPosition(tmp.hw)
      yaw = clamp(Math.atan2(px - tmp.hw.x, DEPTH), -0.3, 0.9)
      pitch = clamp(-Math.atan2(py - tmp.hw.y, DEPTH), -0.45, 0.5)
    }
    const closed = peek.eyesClosed
    if (closed) { yaw = -0.35; pitch = 0.38 }
    head.rotation.y = lerp(head.rotation.y, yaw, LERP)
    head.rotation.x = lerp(head.rotation.x, pitch, LERP)
    head.rotation.z = lerp(head.rotation.z, -LEAN * p * 0.45, LERP)

    // eyes: shut on password focus, otherwise irises drift toward the cursor
    const k = closed ? 0.25 : 0.12
    for (const e of eyes) e.scale.y = lerp(e.scale.y, closed ? 0.05 : 1, k)
    for (const i of irises) {
      i.position.x = lerp(i.position.x, clamp(yaw * 0.035, -0.012, 0.03), LERP)
      i.position.y = lerp(i.position.y, clamp(-pitch * 0.03, -0.018, 0.018), LERP)
    }
    for (const l of lids) l.g.position.y = lerp(l.g.position.y, closed ? l.shut : l.open, k)

    // arms reach to grip the white panel's edge (targets are root-local; undo the lean)
    for (const a of arms) {
      tmp.t.copy(GRIP[a.side]).sub(HIP_V).applyAxisAngle(Z, -lean.rotation.z).add(HIP_V)
      tmp.d.copy(tmp.t).sub(a.shoulder).normalize()
      tmp.q.setFromUnitVectors(a.rest, tmp.d)
      tmp.qi.identity().slerp(tmp.q, clamp(p, 0, 1))
      a.g.quaternion.slerp(tmp.qi, 0.2)
    }
  })

  return <primitive object={rig.root} />
}

/** Transparent strip on the white side that only shows the hands' contact shadow. */
function WallShadow() {
  const {size} = useThree()
  const s = Math.min(size.height / STAFF.length / 1.7, 150)
  const seam = STAGE_LEFT - size.width / 2
  return (
    <mesh position={[seam + STAGE_RIGHT / 2, 0, 0.16 * s]} receiveShadow>
      <planeGeometry args={[STAGE_RIGHT, size.height]} />
      <shadowMaterial transparent opacity={0.12} />
    </mesh>
  )
}

function Lights() {
  const {size} = useThree()
  const half = Math.max(size.width, size.height) / 2 + 100
  return (
    <>
      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#FFFFFF', '#EDE6DD', 0.6]} />
      <directionalLight color="#FFFFFF" intensity={1.15} position={[300, 400, 600]} castShadow
        shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004}
        shadow-camera-left={-half} shadow-camera-right={half} shadow-camera-top={half} shadow-camera-bottom={-half}
        shadow-camera-near={1} shadow-camera-far={3000} />
      <directionalLight color="#FFF6EE" intensity={0.4} position={[-400, 150, 300]} />
    </>
  )
}

export default function PeekingStaff() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    const update = () => setEnabled(mq.matches && webglAvailable())
    update(); mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  if (!enabled) return null
  return (
    <div className="peek-stage" aria-hidden="true">
      <Quiet>
        <Canvas orthographic camera={{zoom: 1, position: [0, 0, 1200], near: 1, far: 4000}} dpr={[1, 2]}
          gl={{alpha: true, antialias: true}} flat shadows style={{pointerEvents: 'none'}}
          onCreated={({gl}) => { gl.localClippingEnabled = true }}>
          <Lights />
          <Suspense fallback={null}>
            {STAFF.map((n, i) => <Character key={n} name={n} index={i} />)}
            <WallShadow />
          </Suspense>
        </Canvas>
      </Quiet>
    </div>
  )
}
