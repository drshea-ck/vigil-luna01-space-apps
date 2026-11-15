import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { buildRig, idle, modelUrl, Quiet, webglAvailable, type StaffId } from './staffRig'

const lerp = THREE.MathUtils.lerp
const clamp = THREE.MathUtils.clamp

type Reaction = { thinking: boolean; answeredAt: number; sentAt: number }

function AvatarFigure({ id, react }: { id: StaffId; react: MutableRefObject<Reaction> }) {
  const gltf = useLoader(GLTFLoader, modelUrl(id))
  const rig = useMemo(() => buildRig(gltf.scene, id, { shadows: 'all' }), [gltf, id])
  const { pointer } = useThree()

  useFrame(state => {
    const t = state.clock.elapsedTime, now = performance.now(), r = react.current
    const sinceAnswer = (now - r.answeredAt) / 1000, sinceSent = (now - r.sentAt) / 1000
    let yaw = clamp(pointer.x * 0.5, -0.45, 0.45), pitch = clamp(-pointer.y * 0.3, -0.25, 0.25), roll = 0, lift = 0
    if (r.thinking) { yaw = -0.25 + Math.sin(t * 1.4) * 0.08; pitch = -0.18; roll = 0.12 }
    if (sinceSent < 0.6) pitch += Math.sin((sinceSent / 0.6) * Math.PI) * 0.25
    if (sinceAnswer < 0.9) { pitch += Math.sin((sinceAnswer / 0.9) * Math.PI * 2) * 0.18; lift = Math.sin((sinceAnswer / 0.9) * Math.PI) * 0.08 }
    rig.head.rotation.y = lerp(rig.head.rotation.y, yaw, 0.08)
    rig.head.rotation.x = lerp(rig.head.rotation.x, pitch, 0.12)
    rig.head.rotation.z = lerp(rig.head.rotation.z, roll, 0.08)
    rig.root.position.y = lerp(rig.root.position.y, lift, 0.25)
    rig.root.rotation.y = Math.sin(t * 0.45) * 0.1
    for (const i of rig.irises) {
      i.position.x = lerp(i.position.x, r.thinking ? -0.015 : clamp(pointer.x * 0.02, -0.02, 0.02), 0.08)
      i.position.y = lerp(i.position.y, r.thinking ? 0.016 : clamp(pointer.y * 0.015, -0.015, 0.015), 0.08)
    }
    idle(rig, t, 0.7, { breathe: r.thinking ? 1.6 : 1 })
  })

  return <primitive object={rig.root} />
}

function Scene({ id, react }: { id: StaffId; react: MutableRefObject<Reaction> }) {
  const { camera } = useThree()
  useEffect(() => { camera.lookAt(0, 1.25, 0) }, [camera])
  return (
    <>
      <ambientLight intensity={0.65} />
      <hemisphereLight args={['#FFFFFF', '#2a201e', 0.5]} />
      <spotLight position={[0.4, 5, 2.4]} angle={0.45} penumbra={0.6} intensity={2.5} decay={0} color="#FFF8EA" castShadow shadow-mapSize={[512, 512]} />
      <directionalLight position={[-3, 2, -3]} intensity={0.5} color="#9ee7f5" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[0.55, 0.58, 64]} />
        <meshBasicMaterial color="#9ec3ff" transparent opacity={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.55, 64]} />
        <shadowMaterial transparent opacity={0.3} />
      </mesh>
      <Suspense fallback={null}>
        <AvatarFigure key={id} id={id} react={react} />
      </Suspense>
    </>
  )
}

export default function InteractiveAvatar3D({ mode, isProcessing }: { mode: StaffId; isProcessing?: boolean }) {
  const [canRender, setCanRender] = useState(false)
  const react = useRef<Reaction>({ thinking: false, answeredAt: 0, sentAt: 0 })

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setCanRender(!reduced && webglAvailable())
  }, [])

  useEffect(() => {
    if (isProcessing) {
      react.current.thinking = true
      react.current.sentAt = performance.now()
    } else if (react.current.thinking) {
      react.current.thinking = false
      react.current.answeredAt = performance.now()
    }
  }, [isProcessing])

  if (!canRender) return null

  return (
    <div className="companion-avatar-3d" aria-hidden="true">
      <Quiet>
        <Canvas
          camera={{ fov: 28, position: [0, 1.45, 3.8], near: 0.1, far: 20 }}
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true }}
          flat
          shadows
        >
          <Scene id={mode} react={react} />
        </Canvas>
      </Quiet>
    </div>
  )
}
