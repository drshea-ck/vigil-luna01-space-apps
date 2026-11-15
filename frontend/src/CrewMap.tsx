// Crew Health Interdependency Map. Reads only endpoints the user is already permitted to use:
// /api/crew (filtered by clinical_read) and each /api/crew/{id}/overview (permission-checked).
// Records are whitelisted to numeric fields before detection; free text never enters this page.
import {useEffect, useMemo, useState, type KeyboardEvent} from 'react'
import {ArrowLeft, CircleAlert, Network} from 'lucide-react'
import {authenticatedFetch} from './Auth'
import {buildCrewMap, CATEGORIES, type Category, type CrewRecord, type DayRange, type Pattern, type Rules} from './crewPatterns'
import {phaseOf} from './missionPlan'

type Mission = {name: string; destination: string; mission_day: number} | null
type Selection = {type: 'crew' | 'pattern' | 'factor'; id: string} | null
type RangeKey = 'all' | 'mission' | 'recent'

const CATEGORY_LABEL: Record<Category, string> = {sleep: 'Sleep', fatigue: 'Fatigue', wellbeing: 'Wellbeing', cardiovascular: 'Cardiovascular', activity: 'Activity'}
const UNIT: Record<string, string> = {
  sleep_below_baseline: 'h', sleep_declining: 'h', hrv_below_baseline: 'ms', hr_above_baseline: 'bpm',
  exercise_below_target: '%', fatigue_review: '/5', fatigue_rising: '/5', wellness_declining: '/5', mood_declining: '/5',
}
const RANGE_LABEL: Record<RangeKey, string> = {all: 'Whole record', mission: 'Since launch', recent: 'Last 7 days'}
const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', {timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'}) + ' UTC'
const initials = (name: string) => { const w = name.trim().split(/\s+/); return ((w[0]?.[0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() }
const signed = (d: number) => (d < 0 ? `D${d}`.replace('-', '−') : `D${d}`)

/** Whitelist numeric fields only: symptoms, notes and encounters are dropped before detection. */
function toRecord(o: {crew: {id: number; name: string; role: string}; synthetic?: boolean; baselines: Record<string, number>; measurements: CrewRecord['measurements']; checkins: (CrewRecord['checkins'][number] & Record<string, unknown>)[]}): CrewRecord {
  return {
    crew: {id: o.crew.id, name: o.crew.name, role: o.crew.role}, synthetic: o.synthetic !== false, baselines: o.baselines,
    measurements: o.measurements.map(m => ({id: m.id, recorded_at: m.recorded_at, mission_day: m.mission_day, heart_rate: m.heart_rate, hrv: m.hrv, sleep_hours: m.sleep_hours, exercise_minutes: m.exercise_minutes, exercise_completion: m.exercise_completion})),
    checkins: o.checkins.map(c => ({id: c.id, recorded_at: c.recorded_at, mission_day: c.mission_day, wellness: c.wellness, fatigue: c.fatigue, mood: c.mood})),
  }
}

const press = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() } }

export default function CrewMap({mission}: {mission: Mission}) {
  const [records, setRecords] = useState<CrewRecord[] | null>(null)
  const [rules, setRules] = useState<Rules | null>(null)
  const [denied, setDenied] = useState(0)
  const [error, setError] = useState('')
  const [rangeKey, setRangeKey] = useState<RangeKey>('all')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [sel, setSel] = useState<Selection>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const r = await authenticatedFetch('/api/crew')
        if (!r.ok) throw new Error('Crew list unavailable.')
        const list: {id: number}[] = await r.json()
        const results = await Promise.all(list.map(c => authenticatedFetch(`/api/crew/${c.id}/overview`).then(x => (x.ok ? x.json() : null)).catch(() => null)))
        if (!live) return
        const ok = results.filter(Boolean)
        setDenied(results.length - ok.length)
        setRules(ok[0]?.demo_rules ?? {sleep_baseline_fraction: 0.85, fatigue_review_score: 4})
        setRecords(ok.map(toRecord))
      } catch (e) { if (live) setError((e as Error).message) }
    })()
    return () => { live = false }
  }, [])

  const current = mission?.mission_day ?? 0
  const range: DayRange = useMemo(() => {
    const days = (records ?? []).flatMap(r => [...r.measurements, ...r.checkins].map(x => x.mission_day))
    const lo = days.length ? Math.min(...days) : -6, hi = days.length ? Math.max(...days, current) : current
    return rangeKey === 'mission' ? {from: 0, to: hi} : rangeKey === 'recent' ? {from: current - 6, to: current} : {from: lo, to: hi}
  }, [records, rangeKey, current])
  const map = useMemo(() => (records && rules ? buildCrewMap(records, rules, range, mission) : null), [records, rules, range, mission])

  const patterns = useMemo(() => (map ? map.patterns.filter(p => category === 'all' || p.category === category) : []), [map, category])
  const factors = useMemo(() => (map ? map.factors.map(f => ({...f, patternIds: f.patternIds.filter(id => patterns.some(p => p.id === id))})).filter(f => f.patternIds.length) : []), [map, patterns])
  const crewName = (id: number) => map?.crew.find(c => c.crewId === id)?.name ?? `Crew ${id}`

  // related sets for highlighting
  const lit = useMemo(() => {
    const crew = new Set<number>(), pats = new Set<string>(), facs = new Set<string>()
    if (!sel || !map) return null
    if (sel.type === 'crew') { const id = Number(sel.id); crew.add(id); patterns.filter(p => p.crewIds.includes(id)).forEach(p => { pats.add(p.id); if (p.factor) facs.add(p.factor.phaseId) }) }
    if (sel.type === 'pattern') { const p = patterns.find(x => x.id === sel.id); if (p) { pats.add(p.id); p.crewIds.forEach(c => crew.add(c)); if (p.factor) facs.add(p.factor.phaseId) } }
    if (sel.type === 'factor') { facs.add(sel.id); patterns.filter(p => p.factor?.phaseId === sel.id).forEach(p => { pats.add(p.id); p.crewIds.forEach(c => crew.add(c)) }) }
    return {crew, pats, facs}
  }, [sel, map, patterns])
  const state = (on: boolean) => (lit ? (on ? 'is-lit' : 'is-dim') : '')

  if (error) return <section className="cmap"><div className="cmap-message"><CircleAlert size={18} /> {error}</div></section>
  if (!map) return <section className="cmap"><div className="cmap-message">Loading permitted crew records…</div></section>

  // layout (viewBox units)
  const rows = Math.max(map.crew.length, patterns.length, factors.length, 3)
  const H = rows * 104 + 48
  const y = (i: number, n: number) => 24 + (H - 48) * ((i + 0.5) / n)
  const CX = 270, PX = 545, FX = 850
  const crewPos = new Map(map.crew.map((c, i) => [c.crewId, y(i, map.crew.length)]))
  const patPos = new Map(patterns.map((p, i) => [p.id, y(i, patterns.length)]))
  const facPos = new Map(factors.map((f, i) => [f.phaseId, y(i, factors.length)]))
  const curve = (x1: number, y1: number, x2: number, y2: number) => { const dx = (x2 - x1) / 2; return `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}` }
  const edgesKey = `${rangeKey}|${category}|${patterns.map(p => p.id).join(',')}`
  const selectedPattern = sel?.type === 'pattern' ? patterns.find(p => p.id === sel.id) : undefined
  const selectedCrew = sel?.type === 'crew' ? map.crew.find(c => c.crewId === Number(sel.id)) : undefined
  const selectedFactor = sel?.type === 'factor' ? factors.find(f => f.phaseId === sel.id) : undefined
  const phaseNow = mission?.name.startsWith('LUNA-01') ? phaseOf(current) : null
  const toggle = (next: NonNullable<Selection>) => setSel(s => (s && s.type === next.type && s.id === next.id ? null : next))

  return (
    <section className="cmap" aria-labelledby="cmap-title">
      <header className="cmap-head">
        <div>
          <p className="cmap-eyebrow">LUNA-01 <i>//</i> CREW-LEVEL PATTERNS</p>
          <h1 id="cmap-title">Crew Health Map</h1>
          <p>Shared health and wellbeing patterns across crew you are permitted to view, detected from recorded synthetic numbers.</p>
        </div>
        <div className="cmap-tools">
          <div className="cmap-seg" role="group" aria-label="Time range">
            {(Object.keys(RANGE_LABEL) as RangeKey[]).map(k => <button key={k} aria-pressed={rangeKey === k} onClick={() => { setRangeKey(k); setSel(null) }}>{RANGE_LABEL[k]}</button>)}
          </div>
          <div className="cmap-chips" role="group" aria-label="Pattern category">
            {(['all', ...CATEGORIES] as const).map(c => <button key={c} aria-pressed={category === c} onClick={() => { setCategory(c); setSel(null) }}>{c === 'all' ? 'All' : CATEGORY_LABEL[c]}</button>)}
          </div>
        </div>
      </header>

      <div className="cmap-body">
        <div className="cmap-stage">
          <div className="cmap-cols" aria-hidden="true"><span>Crew</span><span>Shared patterns</span><span>Mission conditions</span></div>
          <svg className={'cmap-svg' + (lit ? ' has-selection' : '')} viewBox={`0 0 1000 ${H}`} role="img" aria-label={`Network of ${map.crew.length} crew, ${patterns.length} shared patterns and ${factors.length} mission conditions`} onClick={() => setSel(null)}>
            <g className="cmap-edges" key={edgesKey}>
              {patterns.flatMap(p => p.crewIds.map(c => (
                <path key={`c${c}-${p.id}`} className={`edge observed ${state(!!lit?.crew.has(c) && lit.pats.has(p.id))}`} d={curve(CX + 32, crewPos.get(c)!, PX - 138, patPos.get(p.id)!)} />
              )))}
              {patterns.filter(p => p.factor && facPos.has(p.factor.phaseId)).map(p => (
                <path key={`f-${p.id}`} className={`edge ${p.factor!.kind} ${state(!!lit?.pats.has(p.id) && lit.facs.has(p.factor!.phaseId))}`} d={curve(PX + 138, patPos.get(p.id)!, FX - 104, facPos.get(p.factor!.phaseId)!)} />
              ))}
            </g>

            {map.crew.map((c, i) => {
              const cy = crewPos.get(c.crewId)!
              const on = !!lit?.crew.has(c.crewId)
              return (
                <g key={c.crewId} className={`node crew ${c.availability} ${state(on)} ${sel?.type === 'crew' && sel.id === String(c.crewId) ? 'is-selected' : ''}`} style={{animationDelay: `${Math.min(i, 4) * 40}ms`}}
                  role="button" tabIndex={0} aria-pressed={sel?.type === 'crew' && sel.id === String(c.crewId)}
                  aria-label={`${c.name}: ${c.patternIds.length} shared patterns, ${c.availability} data`}
                  onClick={e => { e.stopPropagation(); toggle({type: 'crew', id: String(c.crewId)}) }} onKeyDown={press(() => toggle({type: 'crew', id: String(c.crewId)}))}>
                  <circle cx={CX} cy={cy} r={32} className="disc" />
                  <text x={CX} y={cy + 6} className="initials" textAnchor="middle">{initials(c.name)}</text>
                  <text x={CX - 48} y={cy - 6} className="label" textAnchor="end">{c.name}</text>
                  <text x={CX - 48} y={cy + 16} className="meta" textAnchor="end">
                    {c.availability === 'none' ? 'No records in range' : `${c.latestWellness !== null ? `wellbeing ${c.latestWellness}/5 · ` : ''}${c.patternIds.length} shared`}
                  </text>
                </g>
              )
            })}

            {patterns.length === 0 && (
              <g className="cmap-empty">
                <text x={PX + 60} y={H / 2 - 10} textAnchor="middle" className="label">No shared patterns in this range</text>
                <text x={PX + 60} y={H / 2 + 14} textAnchor="middle" className="meta">
                  {map.crew.filter(c => c.availability !== 'none').length < 2 ? 'At least two crew members need records in the same period.' : 'No rule matched for two or more crew over overlapping days.'}
                </text>
              </g>
            )}

            {patterns.map((p, i) => {
              const cy = patPos.get(p.id)!
              const on = !!lit?.pats.has(p.id)
              return (
                <g key={p.id} className={`node pattern ${state(on)} ${selectedPattern?.id === p.id ? 'is-selected' : ''} ${p.emerging ? 'is-new' : ''}`} style={{animationDelay: `${80 + Math.min(i, 4) * 40}ms`}}
                  role="button" tabIndex={0} aria-pressed={selectedPattern?.id === p.id} aria-label={`${p.name}: ${p.crewIds.length} crew, first observed mission day ${p.firstDay}`}
                  onClick={e => { e.stopPropagation(); toggle({type: 'pattern', id: p.id}) }} onKeyDown={press(() => toggle({type: 'pattern', id: p.id}))}>
                  {p.emerging && <rect className="ring" x={PX - 142} y={cy - 32} width={284} height={64} rx={3} />}
                  <rect className="box" x={PX - 138} y={cy - 28} width={276} height={56} rx={2} />
                  <text x={PX - 122} y={cy - 4} className="label">{p.name}</text>
                  <text x={PX - 122} y={cy + 17} className="meta">{p.crewIds.length} crew · from {signed(p.firstDay)} · {p.sufficiency}</text>
                  {p.emerging && <g className="new-tag"><rect x={PX + 92} y={cy - 45} width={46} height={17} rx={2} /><text x={PX + 115} y={cy - 32.5} className="new" textAnchor="middle">NEW</text></g>}
                </g>
              )
            })}

            {factors.map((f, i) => {
              const cy = facPos.get(f.phaseId)!
              const on = !!lit?.facs.has(f.phaseId)
              return (
                <g key={f.phaseId} className={`node factor ${state(on)} ${selectedFactor?.phaseId === f.phaseId ? 'is-selected' : ''}`} style={{animationDelay: `${160 + Math.min(i, 4) * 40}ms`}}
                  role="button" tabIndex={0} aria-pressed={selectedFactor?.phaseId === f.phaseId} aria-label={`Mission condition ${f.label}, ${f.range}`}
                  onClick={e => { e.stopPropagation(); toggle({type: 'factor', id: f.phaseId}) }} onKeyDown={press(() => toggle({type: 'factor', id: f.phaseId}))}>
                  <rect className="box" x={FX - 104} y={cy - 26} width={208} height={52} rx={26} />
                  <text x={FX} y={cy - 2} className="label" textAnchor="middle">{f.label}</text>
                  <text x={FX} y={cy + 17} className="meta" textAnchor="middle">{f.range}</text>
                </g>
              )
            })}
          </svg>
          <ul className="cmap-legend" aria-label="Relationship types">
            <li><i className="lg observed" />Observed overlap: same recorded trend in 2+ crew</li>
            <li><i className="lg possible" />Possible association: onset timing matches a mission condition</li>
            <li><i className="lg unconfirmed" />Unconfirmed: timing too mixed to relate</li>
          </ul>
        </div>

        <aside className="cmap-panel" aria-live="polite">
          {sel && <button className="cmap-back" onClick={() => setSel(null)}><ArrowLeft size={14} /> All insights</button>}

          {!sel && <>
            <dl className="cmap-stats">
              <div><dt>Crew represented</dt><dd>{map.insights.crewCount}</dd></div>
              <div><dt>Shared patterns</dt><dd>{patterns.length}</dd></div>
              <div><dt>Crew involved</dt><dd>{new Set(patterns.flatMap(p => p.crewIds)).size}</dd></div>
              <div><dt>Emerging</dt><dd>{patterns.filter(p => p.emerging).length}</dd></div>
            </dl>
            <h3 className="cmap-h">Shared patterns</h3>
            {patterns.length ? <ul className="cmap-list">
              {patterns.map(p => <li key={p.id}><button onClick={() => setSel({type: 'pattern', id: p.id})}>
                <span className="cmap-li-name">{p.name}{p.emerging && <em>NEW</em>}</span>
                <span className="cmap-li-meta">{CATEGORY_LABEL[p.category]} · {p.crewIds.length} crew · first {signed(p.firstDay)} · {p.sufficiency} data</span>
              </button></li>)}
            </ul> : <p className="cmap-muted">None detected for {RANGE_LABEL[rangeKey].toLowerCase()}{category !== 'all' ? ` in ${CATEGORY_LABEL[category].toLowerCase()}` : ''}.</p>}
            <h3 className="cmap-h">Mission context</h3>
            <p className="cmap-muted">{mission ? <>{mission.name.split(' - ')[0]} · day {current}{phaseNow ? <> · {phaseNow.condition} ({phaseNow.range})</> : null}</> : 'Mission data unavailable.'}</p>
            <h3 className="cmap-h">Data limitations</h3>
            <ul className="cmap-notes">{[...map.insights.limitations, ...(denied ? [`${denied} crew overview(s) could not be read with your permissions and are excluded.`] : [])].map(l => <li key={l}>{l}</li>)}</ul>
          </>}

          {selectedCrew && <>
            <p className="cmap-kind">Crew member <span className="cmap-tag">SYNTHETIC</span></p>
            <h2>{selectedCrew.name}</h2>
            <p className="cmap-muted">{selectedCrew.role}</p>
            <dl className="cmap-facts">
              <div><dt>Records in range</dt><dd>{selectedCrew.measurementCount} measurements · {selectedCrew.checkinCount} check-ins</dd></div>
              <div><dt>Days covered</dt><dd>{selectedCrew.firstDay === null ? '—' : `${signed(selectedCrew.firstDay)} to ${signed(selectedCrew.lastDay!)}`}</dd></div>
              <div><dt>Latest wellbeing</dt><dd>{selectedCrew.latestWellness === null ? 'No check-in in range' : `${selectedCrew.latestWellness}/5 self-reported · ${signed(selectedCrew.latestWellnessDay!)}`}</dd></div>
            </dl>
            <h3 className="cmap-h">Shared patterns</h3>
            {selectedCrew.patternIds.filter(id => patterns.some(p => p.id === id)).length ? <ul className="cmap-list">{patterns.filter(p => selectedCrew.patternIds.includes(p.id)).map(p => <li key={p.id}><button onClick={() => setSel({type: 'pattern', id: p.id})}><span className="cmap-li-name">{p.name}</span><span className="cmap-li-meta">with {p.crewIds.filter(c => c !== selectedCrew.crewId).map(crewName).join(', ')}</span></button></li>)}</ul> : <p className="cmap-muted">Not part of a shared pattern in this view.</p>}
            <h3 className="cmap-h">Individual signals (not shared)</h3>
            {selectedCrew.signals.filter(s => !s.shared && (category === 'all' || s.category === category)).length ? <ul className="cmap-notes">{selectedCrew.signals.filter(s => !s.shared && (category === 'all' || s.category === category)).map(s => <li key={s.id}>{s.name} · {signed(s.firstDay)} to {signed(s.lastDay)} · {s.observations} obs</li>)}</ul> : <p className="cmap-muted">None in this range.</p>}
            <p className="cmap-fine">Shown because you hold clinical access to this crew member. Free-text symptoms and notes are never shown on this map.</p>
          </>}

          {selectedPattern && <PatternDetail p={selectedPattern} crewName={crewName} onCrew={id => setSel({type: 'crew', id: String(id)})} />}

          {selectedFactor && <>
            <p className="cmap-kind">Mission condition</p>
            <h2>{selectedFactor.label}</h2>
            <p className="cmap-muted">LUNA-01 plan · {selectedFactor.range}</p>
            <h3 className="cmap-h">Linked patterns</h3>
            <ul className="cmap-list">{patterns.filter(p => selectedFactor.patternIds.includes(p.id)).map(p => <li key={p.id}><button onClick={() => setSel({type: 'pattern', id: p.id})}><span className="cmap-li-name">{p.name}</span><span className="cmap-li-meta">{p.factor!.kind === 'possible' ? 'Possible association' : 'Unconfirmed'}</span></button></li>)}</ul>
            <p className="cmap-fine">Mission conditions are linked by onset timing only. Timing overlap is not evidence of a cause.</p>
          </>}
        </aside>
      </div>
      {map.crew.length === 0 && <div className="cmap-message"><Network size={16} /> No crew records are available with your permissions.</div>}
    </section>
  )
}

function PatternDetail({p, crewName, onCrew}: {p: Pattern; crewName: (id: number) => string; onCrew: (id: number) => void}) {
  const unit = UNIT[p.signalId] ?? ''
  return <>
    <p className="cmap-kind">Shared pattern · {CATEGORY_LABEL[p.category]}{p.emerging && <span className="cmap-tag new">NEW</span>}</p>
    <h2>{p.name}</h2>
    <p className="cmap-muted">{p.rule}</p>
    <dl className="cmap-facts">
      <div><dt>Crew affected</dt><dd>{p.crewIds.map((c, i) => <span key={c}>{i ? ', ' : ''}<button className="cmap-link" onClick={() => onCrew(c)}>{crewName(c)}</button></span>)}</dd></div>
      <div><dt>First observed</dt><dd>{signed(p.firstDay)} · {fmt(p.firstAt)}</dd></div>
      <div><dt>Most recent</dt><dd>{signed(p.lastDay)} · {fmt(p.lastAt)}</dd></div>
      <div><dt>Data sufficiency</dt><dd><span className={'cmap-suff ' + p.sufficiency}>{p.sufficiency}</span> {p.sufficiencyReason}</dd></div>
      <div><dt>Relationship</dt><dd>{p.factor ? <><b>{p.factor.kind === 'possible' ? 'Possible association' : 'Unconfirmed'}</b> with {p.factor.label}. {p.factor.reason}</> : 'Observed overlap only; no mission-condition link available.'}</dd></div>
    </dl>
    <h3 className="cmap-h">Supporting observations</h3>
    <table className="cmap-table">
      <thead><tr><th scope="col">Crew</th><th scope="col">Day</th><th scope="col">Value</th><th scope="col">Reference</th></tr></thead>
      <tbody>{p.support.flatMap(s => s.points.map(pt => <tr key={`${s.crewId}-${pt.at}`}><td>{crewName(s.crewId)}</td><td>{signed(pt.day)}</td><td>{pt.value} {unit}</td><td>{pt.reference === undefined ? 'trend' : `${pt.reference} ${unit}`}</td></tr>))}</tbody>
    </table>
    <p className="cmap-fine">An observed overlap shows that recorded numbers moved alike across crew. It does not establish a common cause. Thresholds are configurable demonstration rules, not clinical thresholds.</p>
  </>
}
