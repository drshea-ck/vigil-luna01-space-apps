// LUNA-01 hero scene preparation. Works on the single assembled asset vigil-scene.glb
// (terrain, far ridge, Earth, 705 boulders and the lander), so nothing is loaded twice.
import * as THREE from 'three'
import type {GLTF} from 'three/examples/jsm/loaders/GLTFLoader.js'

export const SCENE_URL = `${import.meta.env.BASE_URL}models/vigil-scene.glb`

/** Camera station and framing, chosen from the asset: lander at (25.3, 3.2, -180.2), Earth ~15° right, ~2° up. */
export const CAMERA = {position: new THREE.Vector3(15, 8.4, -110), pitchDeg: -1.2, baseFov: 15, earthAt: 0.92}
/** Scan pulse sized to the terrain: lander leg span is ~6.6 m. */
export const SCAN = {radius: 6, width: 0.1, band: 1.6, growMs: 1200, releaseFadeMs: 200, endFadeMs: 400}
/** Near field that can be scanned and picked (metres, terrain space). Far ridge and horizon are excluded. */
const NEAR = {minX: -80, maxX: 140, minZ: -320, maxZ: -40}

export const LEMON = new THREE.Color('#FFFACD')
const CREAM = new THREE.Color('#F0F0BF')

import {COMPONENTS, type ComponentDef} from './heroParts'
export {COMPONENTS}
const LEG_STRUTS: [number, number, number][] = [[2.09, 1.71, 2.09], [-2.09, 1.71, 2.09], [2.09, 1.71, -2.09], [-2.09, 1.71, -2.09]]

/** Classify one connected part of the lander by its bounding-box centre (lander-local). Verified against the GLB. */
function classify(c: THREE.Vector3): number {
  if (c.y > 7.62 || (c.x < -0.55 && c.y > 7.2)) return 1                 // dish, feed, mast
  if (c.x > 1.5 && c.y > 4.4 && c.y < 6.5) return 2                       // boom, frame, 4 cell panels
  if (Math.abs(c.x) < 0.6 && c.z > 1.6 && c.y < 3.62) return 3            // ladder rails, rungs, porch
  if (c.y >= 3.6) return 4                                                // ascent stage and fittings
  if (Math.abs(c.x) < 1.3 && Math.abs(c.z) < 1.3) return 5                // foil body, decks, engine bell
  if (c.y < 3.2) return 6                                                 // struts, braces, pads, dampers
  return 0
}

/** Per-vertex part id from welded connected components, so every vertex of one physical part shares an id. */
function tagParts(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const index = geometry.getIndex()
  const n = pos.count, weld = new Int32Array(n), keys = new Map<string, number>()
  for (let v = 0; v < n; v++) {
    const k = `${pos.getX(v).toFixed(3)},${pos.getY(v).toFixed(3)},${pos.getZ(v).toFixed(3)}`
    let id = keys.get(k); if (id === undefined) { id = keys.size; keys.set(k, id) } weld[v] = id
  }
  const parent = new Int32Array(keys.size).map((_, i) => i)
  const find = (x: number) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  const tri = index ? (i: number) => index.getX(i) : (i: number) => i
  const count = index ? index.count : n
  for (let t = 0; t < count; t += 3) { const a = find(weld[tri(t)]); parent[find(weld[tri(t + 1)])] = a; parent[find(weld[tri(t + 2)])] = a }
  const boxes = new Map<number, THREE.Box3>(), p = new THREE.Vector3()
  for (let v = 0; v < n; v++) { const r = find(weld[v]); let b = boxes.get(r); if (!b) boxes.set(r, b = new THREE.Box3()); b.expandByPoint(p.fromBufferAttribute(pos, v)) }
  const partOf = new Map<number, number>(), c = new THREE.Vector3()
  for (const [r, b] of boxes) partOf.set(r, classify(b.getCenter(c)))
  const ids = new Float32Array(n)
  for (let v = 0; v < n; v++) ids[v] = partOf.get(find(weld[v])) ?? 0
  geometry.setAttribute('partId', new THREE.BufferAttribute(ids, 1))
}

export type ScanUniforms = {uScanCenter: {value: THREE.Vector3}; uScanRadius: {value: number}; uScanAlpha: {value: number}; uScanWidth: {value: number}; uScanBand: {value: number}; uScanColor: {value: THREE.Color}}
export type GlowUniforms = {uPart: {value: number}; uGlow: {value: number}; uGlowColor: {value: THREE.Color}}

function patchScan(material: THREE.Material, u: ScanUniforms) {
  material.polygonOffset = true; material.polygonOffsetFactor = 1; material.polygonOffsetUnits = 1   // lets scan lines sit on the surface
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vScanW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 scanP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  scanP = instanceMatrix * scanP;
  #endif
  vScanW = (modelMatrix * scanP).xyz;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uScanCenter; uniform float uScanRadius; uniform float uScanAlpha; uniform float uScanWidth; uniform vec3 uScanColor;
varying vec3 vScanW;`)
      .replace('#include <opaque_fragment>', `if (uScanAlpha > 0.001) {
  float sd = distance(vScanW.xz, uScanCenter.xz);
  float aa = fwidth(sd);
  float w = max(uScanWidth * 0.5, aa * 0.8);
  float ring = 1.0 - smoothstep(w, w + aa * 1.5, abs(sd - uScanRadius));
  float fill = step(sd, uScanRadius) * smoothstep(0.0, uScanRadius + 0.001, sd);
  float halo = exp(-pow((sd - uScanRadius) / 0.45, 2.0));
  outgoingLight += uScanColor * uScanAlpha * (ring * 1.15 + halo * 0.12 + fill * 0.04);
}
#include <opaque_fragment>`)
  }
  material.customProgramCacheKey = () => 'vigil-scan'
}

function patchGlow(material: THREE.Material, u: GlowUniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float partId;\nflat varying float vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = partId;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uPart; uniform float uGlow; uniform vec3 uGlowColor;\nflat varying float vPart;')
      .replace('#include <opaque_fragment>', `if (uGlow > 0.001 && abs(vPart - uPart) < 0.5) {
  float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
  outgoingLight += uGlowColor * uGlow * (0.16 + 0.75 * rim);
}
#include <opaque_fragment>`)
  }
  material.customProgramCacheKey = () => 'vigil-part'
}

export type Prepared = {
  root: THREE.Object3D
  lander: THREE.Object3D
  landerMeshes: THREE.Mesh[]
  pick: THREE.Mesh            // near-field terrain triangles, shares the terrain's vertex buffer; never rendered
  wire: THREE.LineSegments    // terrain + rock edges in the near field, masked to the scan band in the shader
  scan: ScanUniforms
  glow: GlowUniforms
  earthBearing: number        // degrees right of -Z, seen from the camera station
}

const cache = new WeakMap<GLTF, Prepared>()

/** One-time, idempotent preparation (useLoader caches the GLTF across mounts, so this is cached too). */
export function prepare(gltf: GLTF): Prepared {
  const hit = cache.get(gltf); if (hit) return hit
  const root = gltf.scene
  root.updateMatrixWorld(true)
  const scan: ScanUniforms = {uScanCenter: {value: new THREE.Vector3()}, uScanRadius: {value: 0}, uScanAlpha: {value: 0}, uScanWidth: {value: SCAN.width}, uScanBand: {value: SCAN.band}, uScanColor: {value: LEMON.clone()}}
  const glow: GlowUniforms = {uPart: {value: 0}, uGlow: {value: 0}, uGlowColor: {value: CREAM.clone()}}

  const terrain = root.getObjectByName('Terrain') as THREE.Mesh
  const ridge = root.getObjectByName('FarRidge') as THREE.Mesh | undefined
  const earth = root.getObjectByName('Earth') as THREE.Mesh | undefined
  const lander = root.getObjectByName('LUNA01')!

  // Boulders: 705 nodes share 7 rock meshes -> 7 InstancedMeshes.
  const groups = new Map<THREE.BufferGeometry, THREE.Mesh[]>()
  root.traverse(o => { if ((o as THREE.Mesh).isMesh && o.name.startsWith('Boulder')) { const m = o as THREE.Mesh; const g = groups.get(m.geometry); if (g) g.push(m); else groups.set(m.geometry, [m]) } })
  const rocks: THREE.InstancedMesh[] = []
  for (const [geometry, meshes] of groups) {
    const inst = new THREE.InstancedMesh(geometry, meshes[0].material, meshes.length)
    meshes.forEach((m, i) => { inst.setMatrixAt(i, m.matrixWorld); m.removeFromParent() })
    inst.instanceMatrix.needsUpdate = true; inst.computeBoundingSphere(); inst.castShadow = true; inst.receiveShadow = true; inst.name = 'Rocks'
    root.add(inst); rocks.push(inst)
  }

  // Shadows: terrain self-shadows (crater rims), rocks and lander cast; far ridge only receives.
  terrain.castShadow = true; terrain.receiveShadow = true
  if (ridge) { ridge.castShadow = false; ridge.receiveShadow = true }
  if (earth) { earth.castShadow = false; earth.receiveShadow = false }
  patchScan(terrain.material as THREE.Material, scan)
  if (rocks[0]) patchScan(rocks[0].material as THREE.Material, scan)   // one shared "Rock" material

  const landerMeshes: THREE.Mesh[] = []
  lander.traverse(o => { if ((o as THREE.Mesh).isMesh) { const m = o as THREE.Mesh; m.castShadow = true; m.receiveShadow = true; tagParts(m.geometry); patchGlow(m.material as THREE.Material, glow); landerMeshes.push(m) } })

  // Near-field pick mesh (subset index over the shared position buffer) and wireframe edges.
  const tPos = terrain.geometry.getAttribute('position') as THREE.BufferAttribute
  const tIdx = terrain.geometry.getIndex()!
  const sub: number[] = [], edges = new Set<number>(), N = tPos.count
  const inNear = (x: number, z: number) => x >= NEAR.minX && x <= NEAR.maxX && z >= NEAR.minZ && z <= NEAR.maxZ
  for (let t = 0; t < tIdx.count; t += 3) {
    const a = tIdx.getX(t), b = tIdx.getX(t + 1), c = tIdx.getX(t + 2)
    const cx = (tPos.getX(a) + tPos.getX(b) + tPos.getX(c)) / 3, cz = (tPos.getZ(a) + tPos.getZ(b) + tPos.getZ(c)) / 3
    if (!inNear(cx, cz)) continue
    sub.push(a, b, c)
    for (const [p, q] of [[a, b], [b, c], [c, a]]) edges.add(p < q ? p * N + q : q * N + p)
  }
  const pickGeo = new THREE.BufferGeometry(); pickGeo.setAttribute('position', tPos); pickGeo.setIndex(sub)
  pickGeo.boundingBox = new THREE.Box3(new THREE.Vector3(NEAR.minX, -50, NEAR.minZ), new THREE.Vector3(NEAR.maxX, 120, NEAR.maxZ))
  pickGeo.boundingSphere = pickGeo.boundingBox.getBoundingSphere(new THREE.Sphere())
  const pick = new THREE.Mesh(pickGeo); pick.matrixWorld.copy(terrain.matrixWorld); pick.matrixAutoUpdate = false

  const line: number[] = [], v = new THREE.Vector3()
  for (const key of edges) {
    const a = Math.floor(key / N), b = key - a * N
    v.fromBufferAttribute(tPos, a).applyMatrix4(terrain.matrixWorld); line.push(v.x, v.y, v.z)
    v.fromBufferAttribute(tPos, b).applyMatrix4(terrain.matrixWorld); line.push(v.x, v.y, v.z)
  }
  const m4 = new THREE.Matrix4(), origin = new THREE.Vector3()
  for (const inst of rocks) {
    const eGeo = new THREE.EdgesGeometry(inst.geometry, 1), ePos = eGeo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < inst.count; i++) {
      inst.getMatrixAt(i, m4); origin.setFromMatrixPosition(m4)
      if (!inNear(origin.x, origin.z)) continue
      for (let k = 0; k < ePos.count; k++) { v.fromBufferAttribute(ePos, k).applyMatrix4(m4); line.push(v.x, v.y, v.z) }
    }
    eGeo.dispose()
  }
  const wireGeo = new THREE.BufferGeometry(); wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(line, 3)); wireGeo.computeBoundingSphere()
  const wire = new THREE.LineSegments(wireGeo, new THREE.ShaderMaterial({
    uniforms: scan, transparent: true, depthWrite: false,
    // pulled 0.2% toward the camera along the view ray: same screen position, wins the depth test against its own surface
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; mv.xyz *= 0.998; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 uScanCenter; uniform float uScanRadius; uniform float uScanAlpha; uniform float uScanBand; uniform vec3 uScanColor; varying vec3 vW;
void main() { float d = distance(vW.xz, uScanCenter.xz) - uScanRadius; float b = d < 0.0 ? exp(d / uScanBand) : exp(-d / (uScanBand * 0.3)); float a = uScanAlpha * b * 0.75; if (a < 0.02) discard; gl_FragColor = vec4(uScanColor, a); }`,
  }))
  wire.visible = false; wire.renderOrder = 2; wire.name = 'ScanWire'

  const station = CAMERA.position, e = earth ? earth.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(51740, 6109, -193095)
  const earthBearing = THREE.MathUtils.radToDeg(Math.atan2(e.x - station.x, -(e.z - station.z)))

  const prepared = {root, lander, landerMeshes, pick, wire, scan, glow, earthBearing}
  cache.set(gltf, prepared)
  return prepared
}

/** World-space anchor for a component label; landing gear uses the strut nearest the camera. */
export function anchorOf(def: ComponentDef, lander: THREE.Object3D, camera: THREE.Camera, out = new THREE.Vector3()) {
  if (def.anchor !== 'nearest-leg') return lander.localToWorld(out.set(...def.anchor))
  let best = Infinity; const p = new THREE.Vector3()
  for (const s of LEG_STRUTS) { lander.localToWorld(p.set(...s)); const d = p.distanceToSquared(camera.position); if (d < best) { best = d; out.copy(p) } }
  return out
}

/** Frame the camera for an aspect: fixed station and pitch, yaw keeps Earth at ~92% of the width. */
export function frameCamera(camera: THREE.PerspectiveCamera, aspect: number, earthBearing: number) {
  const fov = CAMERA.baseFov * THREE.MathUtils.clamp(2.2 / aspect, 1, 1.7)
  const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect)
  const yaw = THREE.MathUtils.degToRad(earthBearing) - Math.atan((CAMERA.earthAt * 2 - 1) * Math.tan(hHalf))
  camera.position.copy(CAMERA.position)
  camera.rotation.set(THREE.MathUtils.degToRad(CAMERA.pitchDeg), -yaw, 0, 'YXZ')
  camera.fov = fov; camera.aspect = aspect; camera.near = 1; camera.far = 400000
  camera.updateProjectionMatrix(); camera.updateMatrixWorld()
}

/** cubic-bezier(.23, 1, .32, 1): the project's --ease-out, evaluated for JS-driven motion. */
export function easeOut(t: number) {
  if (t <= 0) return 0; if (t >= 1) return 1
  const x1 = 0.23, y1 = 1, x2 = 0.32, y2 = 1
  const bx = (s: number) => 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3
  const by = (s: number) => 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s * s * (1 - s) + s ** 3
  let s = t
  for (let i = 0; i < 6; i++) { const dx = bx(s) - t; const d = 3 * x1 * (1 - s) ** 2 + 6 * (x2 - x1) * s * (1 - s) + 3 * (1 - x2) * s * s; if (Math.abs(d) < 1e-6) break; s -= dx / d }
  return by(Math.min(1, Math.max(0, s)))
}
