/// <reference types="vite/client" />
// Full-screen Medical Companion: 3D specialist-select lobby, then the chat workspace.
// Presentation only: the chosen specialist is passed to <Companion mode=...>, whose existing
// state, API calls and purpose handling are unchanged.
import {Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject} from 'react'
import {Canvas, useFrame, useLoader, useThree} from '@react-three/fiber'
import * as THREE from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {ArrowLeft, ArrowRight, Repeat2, X} from 'lucide-react'
import Companion, {modes} from './Companion'
import {buildRig, idle, modelUrl, Quiet, STAFF, webglAvailable, type StaffId} from './staffRig'

const lerp = THREE.MathUtils.lerp
const clamp = THREE.MathUtils.clamp

// Facts per role, taken from the app itself (Memory.tsx category rules, the models' outfits).
const ROLE: Record<StaffId, {title: string; memory: string; kit: string}> = {
  doctor: {title: 'Doctor', memory: 'General · purpose-scoped', kit: 'Lab coat · stethoscope · glasses'},
  nurse: {title: 'Nurse', memory: 'General · purpose-scoped', kit: 'Clinical scrubs · cap · fob watch'},
  pharmacist: {title: 'Pharmacist', memory: 'None · does not receive memory', kit: 'Tunic · Rx bag · pill bottle'},
  psychologist: {title: 'Psychologist', memory: 'General + psychological · opt-in', kit: 'Blazer · tablet · stylus'},
}
const modeOf = (id: StaffId) => modes.find((m: readonly [string, string, string]) => m[0] === id)!

// V-formation slots by position relative to the active specialist
const SLOTS: {p: [number, number, number]; s: number}[] = [
  {p: [0, 0, 0], s: 1},              // active, front centre
  {p: [1.85, -0.06, -2.7], s: 0.9},  // next, right
  {p: [3.0, -0.1, -5.6], s: 0.86},   // two away, far right
  {p: [-1.85, -0.06, -2.7], s: 0.9}, // previous, left
]

/* ------------------------------------------------------------------ 3D: lobby */

function Platform({active}: {active: boolean}) {
  const ring = useRef<THREE.Group>(null)
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.y += dt * (active ? 0.45 : 0.2)
    if (glow.current) glow.current.opacity = lerp(glow.current.opacity, active ? 0.32 : 0.07, 0.08)
  })
  const ticks = useMemo(() => Array.from({length: 24}, (_, i) => (i / 24) * Math.PI * 2), [])
  return (
    <group>
      <mesh position={[0, -0.09, 0]} receiveShadow>
        <cylinderGeometry args={[1.02, 1.08, 0.18, 64]} />
        <meshStandardMaterial color="#2b2422" roughness={0.55} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.92, 64]} />
        <meshStandardMaterial color="#3a312e" roughness={0.7} metalness={0.15} />
      </mesh>
      <group ref={ring} position={[0, 0.012, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.93, 0.965, 96]} />
          <meshBasicMaterial color={active ? '#F0F0BF' : '#8f8578'} />
        </mesh>
        {ticks.map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.86, 0.004, Math.sin(a) * 0.86]} rotation={[-Math.PI / 2, 0, -a]}>
            <planeGeometry args={[i % 6 === 0 ? 0.09 : 0.045, 0.012]} />
            <meshBasicMaterial color={active ? '#F0F0BF' : '#6d645a'} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.97, 1.55, 96]} />
        <meshBasicMaterial ref={glow} color="#F0F0BF" transparent opacity={0.07} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

function LobbyFigure({id, rel, seed, onPick}: {id: StaffId; rel: number; seed: number; onPick: () => void}) {
  const gltf = useLoader(GLTFLoader, modelUrl(id))
  const rig = useMemo(() => buildRig(gltf.scene, id, {shadows: 'all'}), [gltf, id])
  const grp = useRef<THREE.Group>(null)
  const hop = useRef({y: 0, v: 0, last: rel})
  const {pointer} = useThree()
  useFrame((state, dt) => {
    const g = grp.current; if (!g) return
    const slot = SLOTS[rel], t = state.clock.elapsedTime
    g.position.x = lerp(g.position.x, slot.p[0], 0.085)
    g.position.z = lerp(g.position.z, slot.p[2], 0.085)
    g.scale.setScalar(lerp(g.scale.x, slot.s, 0.085))
    // a small hop when becoming the active specialist
    const h = hop.current
    if (h.last !== rel) { if (rel === 0) h.v = 2.4; h.last = rel }
    h.v -= 14 * Math.min(dt, 1 / 30); h.y = Math.max(0, h.y + h.v * Math.min(dt, 1 / 30)); if (h.y === 0) h.v = Math.max(h.v, 0)
    g.position.y = slot.p[1] + h.y
    // face the camera; the active one sways gently and follows the pointer with its head
    g.rotation.y = lerp(g.rotation.y, rel === 0 ? Math.sin(t * 0.5) * 0.14 : -g.position.x * 0.09, 0.06)
    rig.head.rotation.y = lerp(rig.head.rotation.y, rel === 0 ? clamp(pointer.x * 0.6, -0.5, 0.5) : 0, 0.08)
    rig.head.rotation.x = lerp(rig.head.rotation.x, rel === 0 ? clamp(-pointer.y * 0.35, -0.3, 0.3) : 0.05, 0.08)
    for (const i of rig.irises) {
      i.position.x = lerp(i.position.x, rel === 0 ? clamp(pointer.x * 0.02, -0.02, 0.02) : 0, 0.08)
      i.position.y = lerp(i.position.y, rel === 0 ? clamp(pointer.y * 0.015, -0.015, 0.015) : 0, 0.08)
    }
    idle(rig, t, seed)
  })
  return (
    <group ref={grp} position={SLOTS[rel].p} onClick={e => { e.stopPropagation(); onPick() }}
      onPointerOver={() => { document.body.style.cursor = rel === 0 ? '' : 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
      <Platform active={rel === 0} />
      <primitive object={rig.root} />
    </group>
  )
}

/** Volumetric beam + spotlight aimed at the front pedestal. */
function Spotlight() {
  const light = useRef<THREE.SpotLight>(null)
  const target = useMemo(() => { const o = new THREE.Object3D(); o.position.set(0, 0, 0); return o }, [])
  useEffect(() => { if (light.current) light.current.target = target }, [target])
  return (
    <>
      <primitive object={target} />
      <spotLight ref={light} position={[0, 7.6, 0.35]} angle={0.3} penumbra={0.55} intensity={3.2} decay={0} color="#FFF8EA"
        castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} />
      <mesh position={[0, 3.75, 0.17]}>
        <coneGeometry args={[1.45, 7.5, 64, 1, true]} />
        <meshBasicMaterial color="#FFF6DD" transparent opacity={0.055} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh position={[0, 3.75, 0.17]}>
        <coneGeometry args={[0.75, 7.5, 64, 1, true]} />
        <meshBasicMaterial color="#FFF6DD" transparent opacity={0.04} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </>
  )
}

function Floor() {
  const alpha = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 256
    const g = c.getContext('2d')!; const r = g.createRadialGradient(128, 128, 10, 128, 128, 128)
    r.addColorStop(0, '#fff'); r.addColorStop(0.45, '#777'); r.addColorStop(0.85, '#000'); r.addColorStop(1, '#000')
    g.fillStyle = r; g.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(c)
  }, [])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, -1.6]} receiveShadow>
      <circleGeometry args={[4.6, 64]} />
      <meshStandardMaterial color="#231c1a" roughness={0.9} metalness={0.05} transparent alphaMap={alpha} />
    </mesh>
  )
}

function Dolly({leaving}: {leaving: boolean}) {
  const {camera} = useThree()
  const look = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const to = leaving ? [0, 1.55, 3.2] : [0, 2.15, 10.2]
    camera.position.x = lerp(camera.position.x, to[0], 0.07)
    camera.position.y = lerp(camera.position.y, to[1], 0.07)
    camera.position.z = lerp(camera.position.z, to[2], 0.07)
    look.set(0, leaving ? 1.4 : 1.0, leaving ? 0 : -1.4)
    camera.lookAt(look)
  })
  return null
}

function LobbyScene({active, leaving, onPick}: {active: number; leaving: boolean; onPick: (i: number) => void}) {
  return (
    <>
      <ambientLight intensity={0.42} />
      <hemisphereLight args={['#FFFFFF', '#2a201e', 0.45]} />
      <directionalLight position={[0, 3, 9]} intensity={0.55} />
      <directionalLight position={[-6, 4, -6]} intensity={0.55} color="#9ee7f5" />
      <directionalLight position={[6, 4, -6]} intensity={0.45} color="#9ee7f5" />
      <Spotlight />
      <Floor />
      <Dolly leaving={leaving} />
      <Suspense fallback={null}>
        {STAFF.map((id, i) => <LobbyFigure key={id} id={id} seed={i * 1.37} rel={(i - active + 4) % 4} onPick={() => onPick(i)} />)}
      </Suspense>
    </>
  )
}

/* ------------------------------------------------------------------ 3D: chat avatar */

type Reaction = {thinking: boolean; answeredAt: number; sentAt: number}

function AvatarFigure({id, react}: {id: StaffId; react: MutableRefObject<Reaction>}) {
  const gltf = useLoader(GLTFLoader, modelUrl(id))
  const rig = useMemo(() => buildRig(gltf.scene, id, {shadows: 'all'}), [gltf, id])
  const {pointer} = useThree()
  useFrame(state => {
    const t = state.clock.elapsedTime, now = performance.now(), r = react.current
    const sinceAnswer = (now - r.answeredAt) / 1000, sinceSent = (now - r.sentAt) / 1000
    let yaw = clamp(pointer.x * 0.5, -0.45, 0.45), pitch = clamp(-pointer.y * 0.3, -0.25, 0.25), roll = 0, lift = 0
    if (r.thinking) { yaw = -0.25 + Math.sin(t * 1.4) * 0.08; pitch = -0.18; roll = 0.12 }
    if (sinceSent < 0.6) pitch += Math.sin((sinceSent / 0.6) * Math.PI) * 0.25          // "got it" nod
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
    idle(rig, t, 0.7, {breathe: r.thinking ? 1.6 : 1})
  })
  return <primitive object={rig.root} />
}

function AvatarScene({id, react}: {id: StaffId; react: MutableRefObject<Reaction>}) {
  const {camera} = useThree()
  useEffect(() => { camera.lookAt(0, 1.2, 0) }, [camera])
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#FFFFFF', '#2a201e', 0.45]} />
      <spotLight position={[0.4, 5, 2.4]} angle={0.45} penumbra={0.6} intensity={2.4} decay={0} color="#FFF8EA" castShadow shadow-mapSize={[512, 512]} />
      <directionalLight position={[-3, 2, -3]} intensity={0.5} color="#9ee7f5" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[0.6, 0.63, 64]} />
        <meshBasicMaterial color="#F0F0BF" transparent opacity={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.6, 64]} />
        <shadowMaterial transparent opacity={0.35} />
      </mesh>
      <Suspense fallback={null}><AvatarFigure key={id} id={id} react={react} /></Suspense>
    </>
  )
}

/* ------------------------------------------------------------------ HUD + views */

const beat = (o: number) => `M${o} 40 H${o + 70} L${o + 84} 22 L${o + 92} 58 L${o + 100} 8 L${o + 108} 70 L${o + 116} 40 H${o + 190} L${o + 198} 34 L${o + 206} 40 H${o + 300}`
const ECG = beat(0) + ' ' + beat(300)

function MedBay() {
  return (
    <div className="medbay" aria-hidden="true">
      <svg className="medbay-crosses" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
        {[[120, 110, 1], [880, 140, 0.8], [210, 470, 0.7], [800, 470, 1.1], [500, 70, 0.6]].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}><path d="M-9 -26h18v17h17v18h-17v17h-18v-17h-17v-18h17z" /></g>
        ))}
      </svg>
      {[0.24, 0.78].map(top => (
        <div key={top} className="ecg" style={{top: `${top * 100}%`}}>
          <svg viewBox="0 0 600 80" preserveAspectRatio="none"><path d={ECG} /></svg>
          <svg viewBox="0 0 600 80" preserveAspectRatio="none"><path d={ECG} /></svg>
        </div>
      ))}
    </div>
  )
}

function SpecReadout({id}: {id: StaffId}) {
  const [, label, description] = modeOf(id)
  return (
    <dl className="spec">
      <div><dt>Role</dt><dd>{label}</dd></div>
      <div><dt>Class</dt><dd>Simulated AI · not a licensed professional</dd></div>
      <div><dt>Scope</dt><dd>{description}</dd></div>
      <div><dt>Memory access</dt><dd>{ROLE[id].memory}</dd></div>
      <div><dt>Evidence</dt><dd>{import.meta.env.MODE === 'space-apps' ? 'Reviewed NASA excerpts · deterministic demo' : 'NASA reference excerpts · local model'}</dd></div>
      <div><dt>Kit</dt><dd>{ROLE[id].kit}</dd></div>
    </dl>
  )
}

function Lobby({active, setActive, onInit, onClose, leaving, webgl}: {active: number; setActive: (i: number) => void; onInit: () => void; onClose: () => void; leaving: boolean; webgl: boolean}) {
  const id = STAFF[active], prev = (active + 3) % 4, next = (active + 1) % 4
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return
      if (e.key === 'ArrowLeft') setActive(prev)
      else if (e.key === 'ArrowRight') setActive(next)
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [prev, next, setActive, onClose])
  return (
    <div className={'lobby' + (leaving ? ' leaving' : '')}>
      <MedBay />
      <div className="lobby-canvas" aria-hidden="true">
        {webgl && (
          <Quiet>
            <Canvas camera={{fov: 32, position: [0, 2.15, 10.2], near: 0.1, far: 60}} dpr={[1, 2]} gl={{alpha: true, antialias: true}} flat shadows>
              <LobbyScene active={active} leaving={leaving} onPick={setActive} />
            </Canvas>
          </Quiet>
        )}
      </div>
      <header className="hud-top">
        <span className="hud-title">VIGIL <i>//</i> MEDICAL COMPANION <b>SPECIALIST SELECT</b></span>
        <span className="hud-meta">LOCAL EVIDENCE · SYNTHETIC CREW</span>
        <button className="hud-btn" onClick={onClose}><X size={15} /> Close</button>
      </header>
      <aside className="hud-spec" aria-live="polite">
        <p className="hud-index num">{String(active + 1).padStart(2, '0')}<span> / 04</span></p>
        <h2>{ROLE[id].title}</h2>
        <SpecReadout id={id} />
      </aside>
      <nav className="hud-roster" aria-label="Specialists">
        {STAFF.map((s, i) => (
          <button key={s} aria-pressed={i === active} onClick={() => setActive(i)}>
            <span className="num">{String(i + 1).padStart(2, '0')}</span>{modeOf(s)[1]}
          </button>
        ))}
      </nav>
      <footer className="hud-bottom">
        <button className="hud-arrow" onClick={() => setActive(prev)} aria-label={`Previous: ${ROLE[STAFF[prev]].title}`}><ArrowLeft size={16} /><span>{ROLE[STAFF[prev]].title}</span></button>
        <div className="hud-init">
          <button className="hud-primary" onClick={onInit} autoFocus>Initialize companion</button>
          <p>{modeOf(id)[1]} · simulated AI · research demonstration</p>
        </div>
        <button className="hud-arrow" onClick={() => setActive(next)} aria-label={`Next: ${ROLE[STAFF[next]].title}`}><span>{ROLE[STAFF[next]].title}</span><ArrowRight size={16} /></button>
      </footer>
    </div>
  )
}

export default function CompanionView({crewId, onClose}: {crewId: number; onClose: () => void}) {
  const [stage, setStage] = useState<'lobby' | 'chat'>('lobby')
  const [active, setActive] = useState(0)
  const [mode, setMode] = useState<StaffId>('doctor')
  const [started, setStarted] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const webgl = useMemo(() => webglAvailable(), [])
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const react = useRef<Reaction>({thinking: false, answeredAt: 0, sentAt: 0})
  const chatRef = useRef<HTMLDivElement>(null)

  const initialize = () => {
    setMode(STAFF[active]); setStarted(true)
    if (reduced) { setStage('chat'); return }
    setLeaving(true)
    window.setTimeout(() => { setStage('chat'); setLeaving(false) }, 520)
  }
  const changeSpecialist = () => { setActive(STAFF.indexOf(mode)); setStage('lobby') }

  // avatar reactions: observe the chat (no changes to its logic)
  useEffect(() => {
    const root = chatRef.current; if (!root) return
    let count = root.querySelectorAll('.messages article').length
    const obs = new MutationObserver(() => {
      const n = root.querySelectorAll('.messages article').length
      if (n > count) { react.current.thinking = false; react.current.answeredAt = performance.now() }
      if (root.querySelector('.medical-chat > [role=alert]')) react.current.thinking = false
      count = n
    })
    obs.observe(root, {childList: true, subtree: true})
    return () => obs.disconnect()
  }, [started])
  const onSubmitCapture = (e: React.FormEvent) => {
    if ((e.target as HTMLElement).querySelector('textarea[aria-label="Medical question"]')) {
      react.current.thinking = true; react.current.sentAt = performance.now()
      window.setTimeout(() => { react.current.thinking = false }, 45000)
    }
  }

  return (
    <section className={'companion-view stage-' + stage} aria-label="Medical companion">
      {stage === 'lobby' && <Lobby active={active} setActive={setActive} onInit={initialize} onClose={onClose} leaving={leaving} webgl={webgl} />}
      {started && (
        <div className="cw" hidden={stage !== 'chat'}>
          <header className="cw-top">
            <span className="hud-title">VIGIL <i>//</i> MEDICAL COMPANION</span>
            <span className="cw-active"><span className="dot" /> {modeOf(mode)[1]} <em>· simulated AI</em></span>
            <div className="cw-actions">
              <button className="secondary" onClick={changeSpecialist}><Repeat2 size={15} /> Change specialist</button>
              <button className="text-button" onClick={onClose}><X size={14} /> Close</button>
            </div>
          </header>
          <div className="cw-body">
            <aside className="cw-avatar">
              <div className="cw-stage">
                <MedBay />
                {webgl && stage === 'chat' && (
                  <Quiet>
                    <Canvas camera={{fov: 30, position: [0, 1.55, 4.1], near: 0.1, far: 30}} dpr={[1, 2]} gl={{alpha: true, antialias: true}} flat shadows>
                      <AvatarScene id={mode} react={react} />
                    </Canvas>
                  </Quiet>
                )}
                <p className="cw-name"><span className="num">{String(STAFF.indexOf(mode) + 1).padStart(2, '0')}</span>{ROLE[mode].title}</p>
              </div>
              <SpecReadout id={mode} />
            </aside>
            <div className="cw-chat" ref={chatRef} onSubmitCapture={onSubmitCapture}>
              <Companion crewId={crewId} mode={mode} onModeChange={setMode} />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
