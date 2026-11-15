import { Component, lazy, Suspense, useRef, useState, type ReactNode } from 'react'
import { Bone, Dumbbell, RotateCcw, ShieldCheck } from 'lucide-react'
import { webglAvailable } from './heroParts'
import type { Measurement } from './data'

const BayCanvas = lazy(() => import('./TelemetryBayCanvas'))
export type Station = 'exerciser' | 'bone' | 'body'
export type Layers = { Suit: boolean; Muscle: boolean; Skeleton: boolean }
export type BayControl = { move?: (action: 'left' | 'right' | 'in' | 'out' | 'reset') => void }
export const clinicalBoundary = 'No bone-density change, muscle loss, disease probability or medical fitness is inferred. New bone/muscle measurement features require separate review.'
export const privacyBoundary = 'Private reproductive-health notes remain available only through the explicitly granted category/purpose API. They are not shared with companion modes. No reproductive condition is inferred.'

class BayBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onFail() }
  render() { return this.state.failed ? null : this.props.children }
}

export default function TelemetryBay({ latest }: { latest?: Measurement }) {
  const [station, setStation] = useState<Station>('exerciser')
  const [layers, setLayers] = useState<Layers>({ Suit: true, Muscle: false, Skeleton: false })
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(() => webglAvailable() ? 'loading' : 'failed')
  const [attempt, setAttempt] = useState(0)
  const label = useRef<HTMLDivElement>(null)
  const control = useRef<BayControl>({}).current
  async function retry() {
    try {
      const { resetBayAssets } = await import('./TelemetryBayCanvas')
      resetBayAssets()
      setAttempt(n => n + 1)
      setStatus('loading')
    } catch { setStatus('failed') }
  }
  const activity = latest ? `Recorded exercise: ${latest.exercise_minutes} minutes; session completion: ${latest.exercise_completion}%. These are activity observations, not bone density or muscle mass measurements.` : 'No exercise observation recorded. Activity observations are not bone density or muscle mass measurements.'
  const cards = [
    { id: 'exerciser' as const, title: 'Activity observation only', text: activity, icon: Dumbbell },
    { id: 'bone' as const, title: 'No clinical inference', text: clinicalBoundary, icon: Bone },
    { id: 'body' as const, title: 'Reproductive-health boundary', text: privacyBoundary, icon: ShieldCheck },
  ]
  const callout = station === 'exerciser' ? { title: latest ? `${latest.exercise_minutes} MIN · ${latest.exercise_completion}% COMPLETION` : 'NO ACTIVITY RECORDED', text: 'Activity observations only — no bone-density or muscle mass inferred.' } : station === 'bone' ? { title: 'ILLUSTRATIVE BONE SECTION', text: 'No bone-density change or clinical inference.' } : { title: 'ILLUSTRATIVE ANATOMY', text: 'Layer visibility is illustrative. No reproductive condition is inferred.' }
  return <section className="telemetry-bay ws-section" aria-labelledby="bay-heading">
    <div className="section-head"><div><h3 id="bay-heading" className="micro">Telemetry inspection bay</h3><p>Explore activity and monitoring boundaries</p></div><span className="tag">Synthetic demo</span></div>
    <div className="bay-viewport" aria-label="Interactive illustrative telemetry stage">
      {status !== 'failed' && <BayBoundary key={attempt} onFail={() => setStatus('failed')}><Suspense fallback={null}><BayCanvas station={station} onSelect={setStation} layers={layers} completion={latest?.exercise_completion} label={label} control={control} onReady={() => setStatus('ready')} onFail={() => setStatus('failed')} /></Suspense></BayBoundary>}
      <div className="bay-layers" role="group" aria-label="Anatomy layers">{(['Suit', 'Muscle', 'Skeleton'] as const).map(layer => <button type="button" key={layer} aria-pressed={layers[layer]} disabled={status !== 'ready'} onClick={() => setLayers(current => ({ ...current, [layer]: !current[layer] }))}>{layer.toUpperCase()}</button>)}</div>
      {status === 'ready' && <div ref={label} className="bay-callout" role="status"><strong>{callout.title}</strong><span>{callout.text}</span></div>}
      {status !== 'ready' && <div className="bay-state" role="status"><strong>{status === 'loading' ? 'Loading inspection bay…' : '3D view unavailable'}</strong><p>{status === 'loading' ? 'Preparing the locally bundled models.' : 'You can still select the monitoring cards below.'}</p>{status === 'failed' && <button className="secondary" onClick={retry}>Retry 3D view</button>}</div>}
    </div>
    <div className="bay-toolbar"><p>Drag to orbit · scroll to zoom. Select a model or card to inspect.</p><div role="group" aria-label="3D camera controls">{(['left', 'right', 'in', 'out', 'reset'] as const).map(action => <button type="button" key={action} disabled={status !== 'ready'} aria-label={action === 'reset' ? 'Reset bay view' : `${action === 'left' || action === 'right' ? 'Rotate' : 'Zoom'} ${action}`} onClick={() => control.move?.(action)}>{action === 'reset' ? <RotateCcw size={14} /> : { left: '↶', right: '↷', in: '+', out: '−' }[action]}</button>)}</div></div>
    <div className="bay-cards" role="group" aria-label="Monitoring boundaries">{cards.map(card => <button type="button" className="bay-card" key={card.id} aria-pressed={station === card.id} onClick={() => setStation(card.id)}><span className="bay-card-heading"><card.icon size={18} aria-hidden="true" /><strong>{card.title}</strong><span className="bay-selected">{station === card.id ? 'Selected' : 'Inspect'}</span></span><span>{card.text}</span></button>)}</div>
  </section>
}
