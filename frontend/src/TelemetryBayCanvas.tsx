import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { BayControl, Layers, Station } from './TelemetryBay'

type Props = {
  station: Station; onSelect: (station: Station) => void; layers: Layers; completion?: number
  label: RefObject<HTMLDivElement | null>; control: BayControl; onReady: () => void; onFail: () => void
}
const names = ['vigil-bay', 'vigil-body', 'vigil-exerciser', 'vigil-bone-section']
const urls = names.map(name => `${import.meta.env.BASE_URL}models/${name}.glb`)
export function resetBayAssets() { useLoader.clear(GLTFLoader, urls) }
const home = new THREE.Vector3(0, 4, 7.5)
const center = new THREE.Vector3(0, 0.65, 0)

function World(props: Props) {
  const assets = useLoader(GLTFLoader, urls)
  const { camera, gl, invalidate, size } = useThree()
  const callbacks = useRef(props)
  callbacks.current = props
  const controls = useRef<OrbitControls | null>(null)
  const projected = useMemo(() => new THREE.Vector3(), [])
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.zoom = Math.min(1, size.width / size.height / 1.35)
      camera.updateProjectionMatrix()
      invalidate()
    }
  }, [camera, size.width, size.height, invalidate])
  const scene = useMemo(() => {
    // Own all mutable materials; the loader cache remains reusable across visits.
    const clones = assets.map(asset => {
      const clone = asset.scene.clone(true)
      clone.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.material = Array.isArray(object.material) ? object.material.map(material => material.clone()) : object.material.clone()
          object.castShadow = true
          object.receiveShadow = true
        }
      })
      return clone
    })
    const [bay, body, exerciser, bone] = clones
    bay.getObjectByName('Bay_Floor')?.traverse(object => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
        object.material.color.set('#34362e')
        object.material.metalness = 0.15
        object.material.roughness = 0.8
      }
    })
    const stations = { body, exerciser, bone }
    const anchors = {} as Record<Station, THREE.Vector3>
    for (const [id, spotName] of [['body', 'Spot_Body'], ['exerciser', 'Spot_Exerciser'], ['bone', 'Spot_Bone']] as const) {
      const spot = bay.getObjectByName(spotName)
      if (!spot) throw new Error(`Missing bay mount: ${spotName}`)
      spot.add(stations[id])
      stations[id].traverse(object => { object.userData.station = id })
    }
    bay.updateMatrixWorld(true)
    for (const id of ['body', 'exerciser', 'bone'] as const) {
      const bounds = new THREE.Box3().setFromObject(stations[id])
      anchors[id] = bounds.getCenter(new THREE.Vector3())
      anchors[id].y = bounds.max.y + 0.12
    }
    return { bay, body, anchors }
  }, [assets])

  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement)
    controls.current = orbit
    orbit.enablePan = false
    orbit.enableDamping = false
    orbit.minDistance = 5
    orbit.maxDistance = 14
    orbit.minPolarAngle = 0.25
    orbit.maxPolarAngle = Math.PI / 2 - 0.12
    orbit.target.copy(center)
    orbit.update()
    orbit.addEventListener('change', () => invalidate())
    props.control.move = action => {
      if (action === 'reset') { camera.position.copy(home); orbit.target.copy(center) }
      else {
        const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(orbit.target))
        if (action === 'left' || action === 'right') spherical.theta += action === 'left' ? -0.25 : 0.25
        else spherical.radius = THREE.MathUtils.clamp(spherical.radius * (action === 'in' ? 0.85 : 1.18), orbit.minDistance, orbit.maxDistance)
        camera.position.copy(orbit.target).add(new THREE.Vector3().setFromSpherical(spherical))
      }
      orbit.update(); invalidate()
    }
    const lost = (event: Event) => { event.preventDefault(); callbacks.current.onFail() }
    gl.domElement.addEventListener('webglcontextlost', lost)
    callbacks.current.onReady()
    return () => { orbit.dispose(); controls.current = null; delete props.control.move; gl.domElement.removeEventListener('webglcontextlost', lost) }
  }, [camera, gl, invalidate, props.control])

  useEffect(() => () => {
    scene.bay.traverse(object => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach(material => material.dispose())
      }
    })
  }, [scene])

  useEffect(() => {
    const lit = props.completion === undefined ? 0 : Math.round(THREE.MathUtils.clamp(props.completion, 0, 100) / 100 * 24)
    scene.bay.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !/^Bay_Ring_\d{2}$/.test(object.name)) return
      const on = Number(object.name.slice(-2)) < lit
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach(material => {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.set(on ? '#F0F0BF' : '#35372f')
          material.emissive.set(on ? '#F0F0BF' : '#000000')
          material.emissiveIntensity = on ? 0.85 : 0
        }
      })
    })
    invalidate()
  }, [scene, props.completion, invalidate])

  useEffect(() => {
    const xray = props.layers.Suit && (props.layers.Muscle || props.layers.Skeleton)
    for (const name of ['Suit', 'Muscle', 'Skeleton'] as const) {
      const layer = scene.body.getObjectByName(`Layer_${name}`)
      if (!layer) throw new Error(`Missing anatomy layer: ${name}`)
      layer.visible = props.layers[name]
      if (name === 'Suit') layer.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach(material => { material.transparent = xray; material.opacity = xray ? 0.28 : 1; material.depthWrite = !xray; material.needsUpdate = true })
      })
    }
    invalidate()
  }, [scene, props.layers, invalidate])

  useEffect(() => {
    // A small target shift focuses the station without hiding the other stations.
    const target = scene.anchors[props.station].clone().multiplyScalar(0.22)
    target.y = 0.65
    controls.current?.target.copy(target)
    controls.current?.update()
    invalidate()
  }, [scene, props.station, invalidate])

  useFrame(() => {
    const element = props.label.current
    if (!element) return
    projected.copy(scene.anchors[props.station]).project(camera)
    const offset = props.station === 'exerciser' ? -element.offsetWidth - 20 : 20
    const x = THREE.MathUtils.clamp((projected.x + 1) / 2 * size.width + offset, 12, Math.max(12, size.width - element.offsetWidth - 12))
    const y = THREE.MathUtils.clamp((1 - projected.y) / 2 * size.height - element.offsetHeight, 64, Math.max(64, size.height - element.offsetHeight - 12))
    element.style.transform = `translate(${x}px, ${y}px)`
  })

  return <>
    <ambientLight intensity={1.5} />
    <hemisphereLight args={['#fffce5', '#71645a', 2]} />
    <directionalLight position={[2, 7, 5]} intensity={3} />
    <directionalLight position={[-4, 3, -2]} intensity={1.5} color="#F0F0BF" />
    <primitive object={scene.bay} dispose={null} onClick={(event: { stopPropagation: () => void; object: THREE.Object3D; delta: number }) => {
      const station = event.object.userData.station as Station | undefined
      if (station && event.delta < 5) { event.stopPropagation(); props.onSelect(station) }
    }} />
  </>
}

export default function TelemetryBayCanvas(props: Props) {
  return <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: home.toArray(), fov: 36, near: 0.1, far: 60 }} gl={{ antialias: true, alpha: true }}>
    <World {...props} />
  </Canvas>
}
