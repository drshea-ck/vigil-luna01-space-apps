// Mission overview hero: LUNA-01 identity over an interactive 3D lunar scene.
// Text stays accessible HTML; the canvas is decorative and has a composed still fallback.
import {Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode} from 'react'
import {Mouse, Radar} from 'lucide-react'
import {phaseOf} from './missionPlan'
import {COMPONENTS, webglAvailable} from './heroParts'
import type {HeroController} from './LunarCanvas'

const LunarCanvas = lazy(() => import('./LunarCanvas'))
const POSTER = `${import.meta.env.BASE_URL}hero/luna01-poster.jpg`

type MissionMeta = {name: string; destination: string; mission_day: number}

class SceneBoundary extends Component<{children: ReactNode; onFail: () => void}, {failed: boolean}> {
  state = {failed: false}
  static getDerivedStateFromError() { return {failed: true} }
  componentDidCatch() { this.props.onFail() }
  render() { return this.state.failed ? null : this.props.children }
}

function useMedia(query: string) {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches)
  useEffect(() => { const m = matchMedia(query); const f = () => setOn(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [query])
  return on
}

/** Soft lemon light that follows the pointer through the heading. Eased in rAF; writes CSS variables on one element. */
function useHeadingGlow(target: React.RefObject<HTMLHeadingElement | null>, glow: React.RefObject<HTMLSpanElement | null>, enabled: boolean) {
  useEffect(() => {
    const h = target.current, g = glow.current
    if (!enabled || !h || !g) return
    let tx = 0, ty = 0, cx = 0, cy = 0, ta = 0, ca = 0, raf = 0, last = 0
    const write = () => { g.style.setProperty('--gx', `${cx.toFixed(1)}px`); g.style.setProperty('--gy', `${cy.toFixed(1)}px`); g.style.setProperty('--ga', ca.toFixed(3)) }
    const step = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 16; last = now
      const kp = 1 - Math.exp(-dt / 70), ka = 1 - Math.exp(-dt / (ta > ca ? 90 : 180))
      cx += (tx - cx) * kp; cy += (ty - cy) * kp; ca += (ta - ca) * ka
      const settled = Math.abs(tx - cx) < 0.3 && Math.abs(ty - cy) < 0.3 && Math.abs(ta - ca) < 0.004
      if (settled) { cx = tx; cy = ty; ca = ta; raf = 0; last = 0 } else raf = requestAnimationFrame(step)
      write()
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(step) }
    const move = (e: PointerEvent) => { const r = h.getBoundingClientRect(); tx = e.clientX - r.left; ty = e.clientY - r.top; if (ca < 0.02) { cx = tx; cy = ty } kick() }
    const enter = (e: PointerEvent) => { move(e); ta = 1; kick() }
    const leave = () => { ta = 0; kick() }
    h.addEventListener('pointermove', move); h.addEventListener('pointerenter', enter); h.addEventListener('pointerleave', leave)
    return () => { cancelAnimationFrame(raf); h.removeEventListener('pointermove', move); h.removeEventListener('pointerenter', enter); h.removeEventListener('pointerleave', leave); g.style.removeProperty('--ga') }
  }, [target, glow, enabled])
}

export default function MissionHero({mission, entered, action}: {mission: MissionMeta | null; entered: boolean; action?: ReactNode}) {
  const [code, ...rest] = (mission?.name ?? '').split(' - ')
  const subtitle = rest.join(' - ')
  const phase = mission?.name.startsWith('LUNA-01') ? phaseOf(mission.mission_day) : null
  const day = mission ? String(mission.mission_day).padStart(3, '0') : '---'

  const reduce = useMedia('(prefers-reduced-motion: reduce)')
  const finePointer = useMedia('(hover: hover) and (pointer: fine)')
  const [webgl] = useState(webglAvailable)
  const [scene, setScene] = useState<'loading' | 'ready' | 'failed'>(() => (webgl ? 'loading' : 'failed'))
  const [onScreen, setOnScreen] = useState(true)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [posterOk, setPosterOk] = useState(true)

  const root = useRef<HTMLElement>(null), idBlock = useRef<HTMLDivElement>(null), controls = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null), glow = useRef<HTMLSpanElement>(null)
  const label = useRef<HTMLDivElement>(null), labelName = useRef<HTMLElement>(null), labelDetail = useRef<HTMLSpanElement>(null)
  const leader = useRef<SVGSVGElement>(null), path = useRef<SVGPathElement>(null), dot = useRef<SVGCircleElement>(null)
  const ctl = useRef<HeroController>({els: {root: null, label: null, name: null, detail: null, path: null, dot: null, leader: null, avoid: []}}).current

  useEffect(() => {
    Object.assign(ctl.els, {root: root.current, label: label.current, name: labelName.current, detail: labelDetail.current, path: path.current, dot: dot.current, leader: leader.current, avoid: [idBlock.current, controls.current]})
    ctl.onActive = setActiveId
    ctl.onReady = () => setScene(s => (s === 'failed' ? s : 'ready'))
    ctl.onLost = () => setScene('failed')
  }, [ctl])

  // Pause rendering while the hero is off screen or the page is hidden.
  useEffect(() => {
    const el = root.current; if (!el) return
    let seen = true
    const update = () => { const on = seen && document.visibilityState === 'visible'; setOnScreen(on); if (!on) ctl.cancel?.() }
    const io = new IntersectionObserver(([entry]) => { seen = entry.isIntersecting; update() })
    io.observe(el); document.addEventListener('visibilitychange', update)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', update) }
  }, [ctl])

  useHeadingGlow(title, glow, finePointer && !reduce)

  const live = scene !== 'failed'
  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Escape' && activeId !== null) { e.stopPropagation(); ctl.dismiss?.() } }

  return (
    <section ref={root} className={'hero' + (entered ? ' is-in' : '') + (scene === 'ready' ? ' is-ready' : '') + (scene === 'failed' ? ' is-fallback' : '')}
      aria-labelledby="hero-title" onKeyDown={onKeyDown}>
      <div className="hero-stage" role="img" aria-label="Rendered view of the fictional LUNA-01 lander on the lunar surface, with Earth above the horizon">
        {posterOk && <img className="hero-poster" src={POSTER} alt="" decoding="async" onError={() => setPosterOk(false)} />}
        {webgl && live && (
          <SceneBoundary onFail={() => setScene('failed')}>
            <Suspense fallback={null}>
              <div className="hero-canvas"><LunarCanvas ctl={ctl} active={onScreen} reduce={reduce} /></div>
            </Suspense>
          </SceneBoundary>
        )}
      </div>

      <svg ref={leader} className="hero-leader" aria-hidden="true"><path ref={path} /><circle ref={dot} r="3.5" /></svg>
      <div ref={label} className="hero-label" aria-hidden="true"><div className="hero-label-in"><strong ref={labelName} /><span ref={labelDetail} /></div></div>

      <div ref={idBlock} className="hero-id">
        <p className="hero-eyebrow">{subtitle || 'Active mission'}</p>
        <div className="hero-head">
          <h1 id="hero-title" ref={title} className="hero-title">
            <span className="hero-title-text">{mission ? code : 'Connecting…'}</span>
            <span ref={glow} className="hero-title-glow" aria-hidden="true">{mission ? code : 'Connecting…'}</span>
          </h1>
          <div className="hero-readout">
            <p className="hero-day"><span className="sr-only">Mission elapsed: </span>Day <strong>{day}</strong> <i aria-hidden="true">/</i></p>
            <p className="hero-phase">{phase ? phase.label : '—'}{phase && <span>{phase.range}</span>}</p>
          </div>
        </div>
        <p className="hero-dest">{mission?.destination || '—'}</p>
        <div className="hero-foot">
          {action}
          <span className="brief-env"><span className="dot" /> Local simulation</span>
        </div>
      </div>

      <div ref={controls} className="hero-controls">
        {live && (
          <>
            <div className="hero-scan">
              <button type="button" className="hero-scan-btn" onClick={() => ctl.pulse?.()} disabled={scene !== 'ready'}>
                <Radar size={15} aria-hidden="true" /> Scan terrain
              </button>
              {finePointer && <span className="hero-hint"><Mouse size={15} aria-hidden="true" /> or hold on the ground</span>}
            </div>
            <div className="hero-parts" role="group" aria-label="Inspect lander components">
              <span aria-hidden="true">Inspect</span>
              {COMPONENTS.map(c => (
                <button key={c.id} type="button" aria-pressed={activeId === c.id} aria-label={`${c.name}: ${c.detail}`} disabled={scene !== 'ready'}
                  onFocus={() => ctl.focusPart?.(c.id)} onBlur={() => ctl.focusPart?.(null)}
                  onPointerEnter={e => { if (e.pointerType !== 'touch') ctl.focusPart?.(c.id) }} onPointerLeave={e => { if (e.pointerType !== 'touch' && document.activeElement !== e.currentTarget) ctl.focusPart?.(null) }}
                  onClick={() => ctl.togglePin?.(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          </>
        )}
        {scene === 'failed' && <p className="hero-note">Interactive 3D view unavailable on this device. Showing a still render.</p>}
      </div>
    </section>
  )
}
