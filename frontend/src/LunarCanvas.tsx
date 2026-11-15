// LUNA-01 hero canvas: the assembled lunar scene, terrain scan and lander inspection.
// Renders on demand only; no per-frame React state (all motion lives in refs and shader uniforms).
import {memo, useEffect, useLayoutEffect, useMemo, useRef} from 'react'
import * as THREE from 'three'
import {Canvas, useFrame, useLoader, useThree} from '@react-three/fiber'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {anchorOf, COMPONENTS, easeOut, frameCamera, prepare, SCAN, SCENE_URL} from './lunarScene'

export type HeroElements = {
  root: HTMLElement | null; label: HTMLDivElement | null; name: HTMLElement | null; detail: HTMLElement | null
  path: SVGPathElement | null; dot: SVGCircleElement | null; leader: SVGSVGElement | null; avoid: (HTMLElement | null)[]
}
/** Bridge between the HTML overlay (MissionHero) and the scene. World fills in the actions. */
export type HeroController = {
  els: HeroElements
  focusPart?: (id: number | null) => void   // chips: focus / pointer over a chip
  togglePin?: (id: number) => void           // chip click or tap
  dismiss?: () => void                       // Escape
  pulse?: () => void                         // scan button (keyboard, touch)
  cancel?: () => void                        // hero hidden / page hidden
  onActive?: (id: number | null) => void     // overlay syncs aria-pressed (fires on change only)
  onReady?: () => void
  onLost?: () => void
}

const DEG = Math.PI / 180
const GLOW_MS = 150

function World({ctl, reduce}: {ctl: HeroController; reduce: boolean}) {
  const gltf = useLoader(GLTFLoader, SCENE_URL)
  const P = useMemo(() => prepare(gltf), [gltf])
  const {gl, camera, size, invalidate} = useThree()
  const reduceRef = useRef(reduce); reduceRef.current = reduce

  const lights = useMemo(() => {
    const g = new THREE.Group()
    const focus = new THREE.Vector3(18, 3, -150)
    const dir = (az: number, el: number) => new THREE.Vector3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG))
    const hemi = new THREE.HemisphereLight('#8a7f78', '#1a1414', 0.2)
    const sun = new THREE.DirectionalLight('#fff3d6', 7)     // low sun from the left: long shadows to the right
    sun.position.copy(focus).addScaledVector(dir(-100, 7), 140); sun.target.position.copy(focus)
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, {left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400}); sun.shadow.camera.updateProjectionMatrix()
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.18
    const rim = new THREE.DirectionalLight('#FFFACD', 0.9)   // restrained lemon-chiffon edge light from behind right
    rim.position.copy(focus).addScaledVector(dir(150, 22), 120); rim.target.position.copy(focus)
    g.add(hemi, sun, sun.target, rim, rim.target)
    return g
  }, [])

  useLayoutEffect(() => { frameCamera(camera as THREE.PerspectiveCamera, size.width / size.height, P.earthBearing); invalidate() }, [camera, size.width, size.height, P, invalidate])

  // Static scene: render the shadow map once, then reuse it for every on-demand frame.
  useEffect(() => {
    gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; invalidate()
    const id = requestAnimationFrame(() => ctl.onReady?.())
    return () => cancelAnimationFrame(id)
  }, [gl, invalidate, ctl])

  // ---- motion state (refs only) ----
  const s = useRef({
    phase: 'idle' as 'idle' | 'grow' | 'fade', t0: 0, fadeT0: 0, fadeFrom: 0, fadeMs: 0, auto: false, pointer: -1, radius: 0, alpha: 0,
    glowFrom: 0, glowTo: 0, glowT0: 0, glow: 0,
    hover: null as number | null, focus: null as number | null, pin: null as number | null, active: null as number | null, shown: null as number | null,
    labelSize: [0, 0] as [number, number],
  }).current

  const startFade = (ms: number) => { s.phase = 'fade'; s.fadeT0 = performance.now(); s.fadeFrom = s.alpha; s.fadeMs = ms }
  const startScan = (point: THREE.Vector3, pointer: number, auto = false) => {
    P.scan.uScanCenter.value.copy(point); s.phase = 'grow'; s.t0 = performance.now(); s.auto = auto; s.pointer = pointer; s.radius = 0; s.alpha = 1; invalidate()
  }
  const endScan = () => { if (s.phase === 'grow' && !s.auto) { startFade(reduceRef.current ? 0 : SCAN.releaseFadeMs); s.pointer = -1; invalidate() } }

  const setActive = () => {
    const next = s.focus ?? s.pin ?? s.hover
    if (next === s.active) return
    s.active = next
    const now = performance.now()
    if (next !== null) {
      P.glow.uPart.value = next
      s.glowFrom = s.shown === null ? s.glow : 0.35; s.glowTo = 1
      s.shown = next
      const def = COMPONENTS.find(c => c.id === next)!
      const {label, name, detail, leader} = ctl.els
      if (name) name.textContent = def.name
      if (detail) detail.textContent = def.detail
      if (label) { s.labelSize = [label.offsetWidth, label.offsetHeight]; label.classList.add('is-on') }
      leader?.classList.add('is-on')
    } else {
      s.glowFrom = s.glow; s.glowTo = 0
      ctl.els.label?.classList.remove('is-on'); ctl.els.leader?.classList.remove('is-on')
    }
    s.glowT0 = now
    ctl.onActive?.(next)
    invalidate()
  }

  // Label + leader: placed from the projected anchor, kept clear of the heading and controls.
  const anchor = useMemo(() => new THREE.Vector3(), [])
  const placeLabel = () => {
    const {root, label, path, dot, avoid} = ctl.els
    if (!root || !label || !path || !dot || s.shown === null) return
    const def = COMPONENTS.find(c => c.id === s.shown)!
    anchorOf(def, P.lander, camera, anchor).project(camera)
    const W = size.width, H = size.height
    const ax = (anchor.x + 1) / 2 * W, ay = (1 - anchor.y) / 2 * H
    const [lw, lh] = s.labelSize
    const base = root.getBoundingClientRect()
    const blocks = avoid.filter(Boolean).map(el => { const r = el!.getBoundingClientRect(); return [r.left - base.left - 12, r.top - base.top - 12, r.right - base.left + 12, r.bottom - base.top + 12] })
    const fits = (x: number, y: number) => x >= 12 && y >= 12 && x + lw <= W - 12 && y + lh <= H - 12 && !blocks.some(([l, t, r, b]) => x < r && x + lw > l && y < b && y + lh > t)
    const cands: [number, number][] = [[ax + 34, ay - 58 - lh], [ax - 34 - lw, ay - 58 - lh], [ax + 34, ay + 46], [ax - 34 - lw, ay + 46], [ax + 34, ay - lh / 2], [ax - 34 - lw, ay - lh / 2]]
    let [lx, ly] = cands.find(([x, y]) => fits(x, y)) ?? cands[0]
    lx = Math.min(Math.max(lx, 12), W - 12 - lw); ly = Math.min(Math.max(ly, 12), H - 12 - lh)
    label.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`
    const right = lx + lw / 2 > ax, by = ly + lh + 3
    path.setAttribute('d', `M${ax.toFixed(1)} ${ay.toFixed(1)} L${(right ? lx : lx + lw).toFixed(1)} ${by.toFixed(1)} L${(right ? lx + lw : lx).toFixed(1)} ${by.toFixed(1)}`)
    dot.setAttribute('cx', ax.toFixed(1)); dot.setAttribute('cy', ay.toFixed(1))
  }

  useFrame(state => {
    const now = performance.now(), reduced = reduceRef.current
    let moving = false
    if (s.phase === 'grow') {
      const k = (now - s.t0) / SCAN.growMs
      if (reduced) { s.radius = SCAN.radius * 0.6; s.alpha = 1; if (s.auto && now - s.t0 > 900) startFade(0) }
      else { s.radius = SCAN.radius * easeOut(Math.min(1, k)); s.alpha = 1; if (k >= 1) { s.pointer = -1; startFade(SCAN.endFadeMs) } }
      moving = true
    }
    if (s.phase === 'fade') {
      const k = s.fadeMs ? (now - s.fadeT0) / s.fadeMs : 1
      s.alpha = s.fadeFrom * (1 - easeOut(Math.min(1, k)))
      if (k >= 1) { s.phase = 'idle'; s.alpha = 0 } else moving = true
    }
    P.scan.uScanRadius.value = s.radius; P.scan.uScanAlpha.value = s.alpha; P.wire.visible = s.alpha > 0.001
    if (s.glow !== s.glowTo) {
      const k = reduced ? 1 : (now - s.glowT0) / GLOW_MS
      s.glow = k >= 1 ? s.glowTo : s.glowFrom + (s.glowTo - s.glowFrom) * easeOut(k)
      if (s.glow === 0) s.shown = null
      moving = moving || s.glow !== s.glowTo
    }
    P.glow.uGlow.value = s.glow
    if (s.shown !== null && s.active !== null) placeLabel()
    if (moving) state.invalidate()
  })

  // ---- pointer, keyboard bridge ----
  useEffect(() => {
    const el = gl.domElement
    el.style.touchAction = 'pan-y pinch-zoom'
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const aim = (e: PointerEvent) => { const r = el.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera) }
    const partAt = () => {
      const h = ray.intersectObjects(P.landerMeshes, false)[0]
      if (!h?.face) return null
      const id = (h.object as THREE.Mesh).geometry.getAttribute('partId').getX(h.face.a)
      return {id: id || null, distance: h.distance}
    }
    const groundAt = () => ray.intersectObject(P.pick, false)[0] ?? null
    let queued = 0, last: PointerEvent | null = null
    let touch: {id: number; x: number; y: number; timer: number; part: number | null} | null = null

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        if (touch && e.pointerId === touch.id && Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 8) { clearTimeout(touch.timer); touch = null }
        return
      }
      last = e
      if (queued) return
      queued = requestAnimationFrame(() => {
        queued = 0; if (!last) return
        aim(last); const p = partAt()
        el.style.cursor = p?.id ? 'pointer' : 'crosshair'
        if (s.hover !== (p?.id ?? null)) { s.hover = p?.id ?? null; setActive() }
      })
    }
    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return
      aim(e)
      const p = partAt(), g = groundAt()
      const onLander = p && (!g || p.distance <= g.distance)
      if (e.pointerType === 'touch') {
        const part = onLander ? p!.id : null
        const timer = !onLander && g ? window.setTimeout(() => { if (touch) startScan(g.point, e.pointerId) }, 160) : 0
        touch = {id: e.pointerId, x: e.clientX, y: e.clientY, timer, part}
        return
      }
      if (onLander || !g) return
      el.setPointerCapture(e.pointerId)
      startScan(g.point, e.pointerId)
    }
    const onUp = (e: PointerEvent) => {
      if (touch && e.pointerId === touch.id) {
        clearTimeout(touch.timer)
        if (s.phase !== 'grow' || s.pointer !== e.pointerId) { s.pin = touch.part !== null && s.pin !== touch.part ? touch.part : null; setActive() }
        touch = null
      }
      if (e.pointerId === s.pointer) endScan()
    }
    const onCancel = (e: PointerEvent) => { if (touch && e.pointerId === touch.id) { clearTimeout(touch.timer); touch = null } if (e.pointerId === s.pointer) endScan() }
    const onLeave = (e: PointerEvent) => { if (e.pointerType !== 'touch') { last = null; el.style.cursor = ''; if (s.hover !== null) { s.hover = null; setActive() } } }
    const onBlur = () => endScan()
    const onLost = (e: Event) => { e.preventDefault(); ctl.onLost?.() }

    el.addEventListener('pointermove', onMove); el.addEventListener('pointerdown', onDown); el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel); el.addEventListener('lostpointercapture', onCancel as EventListener); el.addEventListener('pointerleave', onLeave)
    el.addEventListener('webglcontextlost', onLost); window.addEventListener('blur', onBlur)

    ctl.focusPart = id => { s.focus = id; setActive() }
    ctl.togglePin = id => { s.pin = s.pin === id ? null : id; setActive() }
    ctl.dismiss = () => { s.focus = null; s.pin = null; s.hover = null; setActive() }
    ctl.pulse = () => {
      // keyboard / touch control: a full pulse in open ground just in front of the lander
      const p = P.lander.localToWorld(new THREE.Vector3(0, 0, 9))
      ray.set(new THREE.Vector3(p.x, 200, p.z), new THREE.Vector3(0, -1, 0))
      const g = ray.intersectObject(P.pick, false)[0]
      startScan(g ? g.point : p, -1, true)
    }
    ctl.cancel = () => { if (s.phase === 'grow') { s.auto = false; endScan() } s.hover = null; setActive() }

    return () => {
      cancelAnimationFrame(queued); if (touch) clearTimeout(touch.timer)
      el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel); el.removeEventListener('lostpointercapture', onCancel as EventListener); el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('webglcontextlost', onLost); window.removeEventListener('blur', onBlur)
      ctl.focusPart = ctl.togglePin = ctl.dismiss = ctl.pulse = ctl.cancel = undefined
      // reset shared (cached) uniforms so a remount starts clean
      P.scan.uScanAlpha.value = 0; P.glow.uGlow.value = 0; P.wire.visible = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, P, ctl])

  useEffect(() => () => { lights.traverse(o => { if ((o as THREE.DirectionalLight).isDirectionalLight) (o as THREE.DirectionalLight).shadow?.dispose() }) }, [lights])

  return (
    <>
      <primitive object={lights} dispose={null} />
      <primitive object={P.root} dispose={null} />
      <primitive object={P.wire} dispose={null} />
    </>
  )
}

function LunarCanvas({ctl, active, reduce}: {ctl: HeroController; active: boolean; reduce: boolean}) {
  return (
    <Canvas frameloop={active ? 'demand' : 'never'} dpr={[1, 1.5]} shadows={{type: THREE.PCFShadowMap}}
      gl={{antialias: true, alpha: true, powerPreference: 'high-performance'}}
      camera={{fov: 15, near: 1, far: 400000}}
      onCreated={({gl}) => { gl.toneMappingExposure = 1.3; gl.setClearColor(0x000000, 0) }}>
      <World ctl={ctl} reduce={reduce} />
    </Canvas>
  )
}

export default memo(LunarCanvas)
