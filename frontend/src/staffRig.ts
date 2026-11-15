/// <reference types="vite/client" />
// Shared rig for the chibi staff .glb models (presentation only).
//
// The .glb files have no skeleton or morph targets: every part is a separately named mesh with
// vertices already in model space (Y up, facing +Z, 0..2 units tall). buildRig re-parents those
// meshes into pivot groups: Head (pivot at the neck), Sclera+Iris+EyeHL per eye (pivot at the
// sclera centre), Lid per eye, and Shoulder/Arm/Sleeve/Cuff/Hand/Thumb per arm (pivot at the shoulder).
import * as THREE from 'three'
import {Component, type ReactNode} from 'react'

export const STAFF = ['doctor', 'nurse', 'pharmacist', 'psychologist'] as const
export type StaffId = typeof STAFF[number]
export const modelUrl = (name: string) => `${import.meta.env.BASE_URL}models/${name}.glb`

export const HIP = 0.6     // lean pivot height
export const NECK = 1.3    // head pivot height
// hand-held props (hidden when the hands are busy gripping something)
const HELD_PROPS = /^(Tablet|TabletScreen|TabletUI\d+|Stylus|StylusTip|PillBottle|PillBottleCap|PillBottleLabel|RxBag|RxBagFold|RxCross[VH])$/

export type Arm = {g: THREE.Group; shoulder: THREE.Vector3; rest: THREE.Vector3; side: 'L' | 'R'}
export type Rig = {
  root: THREE.Group; lean: THREE.Group; body: THREE.Group; head: THREE.Group
  eyes: THREE.Group[]; irises: THREE.Group[]; lids: {g: THREE.Group; open: number; shut: number}[]
  arms: Arm[]; bodyPlane: THREE.Plane; handPlane: THREE.Plane
}

const centre = (m: THREE.Mesh) => {
  m.geometry.computeBoundingBox()
  return m.geometry.boundingBox!.getCenter(new THREE.Vector3())
}
/** Put a model-space mesh under `parent`, whose origin sits at model-space point `pivot`. */
const attach = (m: THREE.Object3D, parent: THREE.Object3D, pivot: THREE.Vector3) => { m.position.copy(pivot).negate(); parent.add(m) }
const group = (parent: THREE.Object3D, at: THREE.Vector3, parentPivot: THREE.Vector3) => {
  const g = new THREE.Group(); g.position.copy(at).sub(parentPivot); parent.add(g); return g
}

export function buildRig(source: THREE.Object3D, name: string, opts: {clip?: boolean; hideProps?: boolean; shadows?: 'hands' | 'all' | 'none'} = {}): Rig {
  const {clip = false, hideProps = false, shadows = 'none'} = opts
  const scene = source.clone(true)
  const meshes: THREE.Mesh[] = []
  scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh) })
  const byName = new Map(meshes.map(m => [m.name, m]))

  const hipV = new THREE.Vector3(0, HIP, 0)
  const root = new THREE.Group(), lean = new THREE.Group(), body = new THREE.Group()
  root.add(lean); lean.position.copy(hipV); lean.add(body); body.position.copy(hipV).negate()
  const origin = new THREE.Vector3()
  const headPivot = new THREE.Vector3(0, NECK, 0)
  const head = group(body, headPivot, origin)

  const bodyPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)
  const handPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)

  // every mesh gets its own material (skin is shared by head + hands in the source)
  const headParts: string[] = []
  for (const m of meshes) {
    if (hideProps && HELD_PROPS.test(m.name)) { m.visible = false; continue }
    const isHand = /^(Hand|Thumb)[LR]$/.test(m.name)
    const mat = (m.material as THREE.Material).clone()
    if (clip) { mat.clippingPlanes = [isHand ? handPlane : bodyPlane]; mat.clipShadows = true }
    m.material = mat
    m.castShadow = shadows === 'all' || (shadows === 'hands' && isHand)
    if (centre(m).y >= NECK + 0.06) { attach(m, head, headPivot); headParts.push(m.name) } else attach(m, body, origin)
  }

  // eyes, irises and lids inside the head
  const eyes: THREE.Group[] = [], irises: THREE.Group[] = [], lids: Rig['lids'] = []
  for (const s of ['L', 'R']) {
    const sclera = byName.get('Sclera' + s)
    if (!sclera) continue
    const c = centre(sclera)
    const eye = group(head, c, headPivot)
    attach(sclera, eye, c)
    const iris = new THREE.Group(); eye.add(iris)
    for (const part of ['Iris' + s, 'EyeHL' + s]) { const m = byName.get(part); if (m) attach(m, iris, c) }
    eyes.push(eye); irises.push(iris)
    const lid = byName.get('Lid' + s)
    if (lid) {
      const lc = centre(lid)
      const g = group(head, lc, headPivot)
      attach(lid, g, lc)
      lids.push({g, open: g.position.y, shut: g.position.y - (lc.y - c.y)})
    }
  }

  // arms, pivoting at the shoulder
  const arms: Arm[] = []
  for (const side of ['L', 'R'] as const) {
    const sh = byName.get('Shoulder' + side), hand = byName.get('Hand' + side)
    if (!sh || !hand) continue
    const shoulder = centre(sh)
    const g = group(body, shoulder, origin)
    for (const part of ['Shoulder', 'Arm', 'Sleeve', 'SleeveTrim', 'Cuff', 'Hand', 'Thumb']) {
      const m = byName.get(part + side); if (m) attach(m, g, shoulder)
    }
    arms.push({g, shoulder, rest: centre(hand).sub(shoulder).normalize(), side})
  }

  if (import.meta.env.DEV) {
    console.debug(`[staffRig] ${name}: head pivot → ${headParts.length} meshes (${headParts.join(', ')}); eyes ${eyes.length} (Sclera/Iris/EyeHL), lids ${lids.length}, arms ${arms.map(a => a.side).join('+')}`)
  }
  return {root, lean, body, head, eyes, irises, lids, arms, bodyPlane, handPlane}
}

/** Shared idle behaviour: breathing, natural blinking and an eyes-closed override. */
export function idle(rig: Rig, t: number, seed: number, opts: {closed?: boolean; breathe?: number} = {}) {
  const {closed = false, breathe = 1} = opts
  rig.body.scale.y = 1 + Math.sin(t * 1.6 + seed) * 0.008 * breathe
  rig.body.scale.x = rig.body.scale.z = 1 - Math.sin(t * 1.6 + seed) * 0.004 * breathe
  // blink: a 140 ms dip roughly every 3.5–5 s, offset per character
  const period = 3.6 + (seed % 1.4)
  const phase = (t + seed * 1.7) % period
  const blink = phase < 0.14 ? Math.sin((phase / 0.14) * Math.PI) : 0
  const open = closed ? 0.05 : 1 - blink * 0.92
  for (const e of rig.eyes) e.scale.y = THREE.MathUtils.lerp(e.scale.y, open, closed ? 0.25 : 0.6)
  for (const l of rig.lids) l.g.position.y = THREE.MathUtils.lerp(l.g.position.y, closed || blink > 0.5 ? l.shut : l.open, 0.5)
}

export const webglAvailable = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false } }

/** Error boundary for decorative WebGL: no WebGL or a failed model load renders nothing. */
export class Quiet extends Component<{children: ReactNode; fallback?: ReactNode}, {failed: boolean}> {
  state = {failed: false}
  static getDerivedStateFromError() { return {failed: true} }
  componentDidCatch() { /* decorative */ }
  render() { return this.state.failed ? (this.props.fallback ?? null) : this.props.children }
}
