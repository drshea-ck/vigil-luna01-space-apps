// Presentational pieces for VIGIL. No data fetching, no state.
import {Orbit} from 'lucide-react'
import {PHASES, phaseOf, planDay} from './missionPlan'
export {PHASES, phaseOf, planDay}

const DAYS = Array.from({length: 15}, (_, i) => i - 6) // LUNA-01 plan: day -6 .. day 8


/** LUNA-01 plan as a precise phase scale with the current mission day marked. */
export function MissionTimeline({day}: {day: number}) {
  const now = planDay(day)
  const left = ((now + 6 + 0.5) / 15) * 100
  return (
    <div className="timeline" role="img" aria-label={`LUNA-01 plan: day -6 to day 8. Current mission day ${day}.`}>
      <div className="tl-phases" aria-hidden="true">
        {PHASES.map(p => (
          <div key={p.id} style={{flexGrow: p.to - p.from + 1}}
            className={['tl-phase', p.id, now > p.to ? 'done' : '', now >= p.from && now <= p.to ? 'current' : ''].join(' ').trim()}>
            <span className="tl-label">{p.label}</span>
            <span className="tl-range">{p.range}</span>
          </div>
        ))}
      </div>
      <div className="tl-scale" aria-hidden="true">
        {DAYS.map(d => <span key={d} className={d === now ? 'now' : d < now ? 'past' : ''}>{d}</span>)}
      </div>
      <div className="tl-marker" style={{left: `${left}%`}} aria-hidden="true"><span>DAY {day}</span></div>
    </div>
  )
}

/** Sign-in showcase: the LUNA-01 transfer drawn as a technical schematic (vector, no data claims). */
export function AuthShowcase() {
  return (
    <div className="sc">
      <div className="sc-brand">
        <span className="sc-mark"><Orbit size={22} /></span>
        <span>VIGIL<small>MISSION HEALTH SYSTEMS</small></span>
      </div>
      <div className="sc-body">
        <p className="sc-eyebrow">LUNA-01 · Fictional lunar south-pole landing</p>
        <h1>Vital Intelligence and Guidance for Interplanetary Life</h1>
        <svg className="sc-schematic" viewBox="0 0 560 230" role="img" aria-label="LUNA-01 mission profile: Earth baselines, launch, three-day transit, landing and lunar surface operations">
          <defs>
            <pattern id="sc-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="currentColor" strokeOpacity=".09" strokeWidth="1" /></pattern>
          </defs>
          <rect width="560" height="230" fill="url(#sc-grid)" />
          <line x1="20" y1="170" x2="540" y2="170" stroke="currentColor" strokeOpacity=".35" strokeWidth="1" />
          <circle cx="86" cy="170" r="40" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path d="M60 158c14-8 30-6 40 4M70 186c10 4 24 2 34-8" fill="none" stroke="currentColor" strokeOpacity=".55" strokeWidth="1" />
          <circle cx="478" cy="170" r="20" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <circle cx="472" cy="164" r="3" fill="none" stroke="currentColor" strokeOpacity=".55" />
          <path d="M126 168C200 40 380 40 458 166" fill="none" stroke="currentColor" strokeWidth="1.25" strokeDasharray="5 5" />
          <circle cx="126" cy="168" r="3.5" fill="currentColor" />
          <circle cx="292" cy="72" r="3.5" fill="currentColor" />
          <circle cx="458" cy="166" r="3.5" fill="currentColor" />
          <g className="sc-label">
            <text x="134" y="190" textAnchor="start">D0 LAUNCH</text>
            <text x="292" y="56" textAnchor="middle">D1–D3 TRANSIT</text>
            <text x="450" y="190" textAnchor="end">D4 LANDING</text>
            <text x="86" y="226" textAnchor="middle">D−6 … D−1 BASELINES</text>
            <text x="478" y="214" textAnchor="middle">D5–D8 SURFACE</text>
          </g>
        </svg>
        <dl className="sc-facts">
          <div><dt>Local-first</dt><dd>No cloud services required</dd></div>
          <div><dt>Synthetic data</dt><dd>Fictional crew and simulated measurements</dd></div>
          <div><dt>Evidence only</dt><dd>No diagnosis or prescribing</dd></div>
        </dl>
      </div>
      <div className="sc-foot"><span>VIGIL / FOUNDATION 01</span><span>v0.1</span></div>
    </div>
  )
}
