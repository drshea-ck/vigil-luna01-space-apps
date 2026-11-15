// Data-bound telemetry charts (Recharts). Presentational only: every value comes from props.
// Palette validated with the dataviz validator (light mode, white surface, --pairs all):
// series #0891b2 / #4f46e5 / #db2777 pass lightness, chroma, CVD (worst dE 10.3) and 3:1 contrast.
import type {CSSProperties, ReactNode} from 'react'
import {Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'

export const VIZ = {
  s1: '#0891b2',       // observed series / wellness (cyan)
  s2: '#4f46e5',       // mood (indigo)
  s3: '#db2777',       // fatigue (pink)
  baseline: '#3f3d38', // personal baseline reference (neutral ink, dashed)
  caution: '#b45309',  // demo indicator thresholds (amber)
  normal: '#047857',   // targets / within configured demo rules (emerald)
  critical: '#b91c1c', // unavailable / outage (crimson)
  grid: '#e7e5dd',
  axisLine: '#c9c6bb',
  axis: '#5f5c55',
}

const utc = (iso: string) => new Date(iso).toLocaleString('en-GB', {timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'}) + ' UTC'
// exact recorded value (up to 2 dp), never rounded to the axis precision
const fmt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '—')
const signed = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '±') + String(Math.round(Math.abs(v) * 100) / 100)

/** Clean axis scale (1/2/2.5/5 x 10^n steps) that always contains the data, baseline and threshold. */
function niceScale(vals: number[]) {
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const span = hi - lo || Math.abs(hi) || 1
  const raw = span / 4, mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= raw) ?? 10 * mag
  const min = Math.floor((lo - span * 0.06) / step) * step, max = Math.ceil((hi + span * 0.06) / step) * step
  const ticks: number[] = []
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Math.round(t * 1000) / 1000)
  return {domain: [min, max] as [number, number], ticks, decimals: step < 0.1 ? 2 : step < 1 ? 1 : 0}
}

type Row = {day: string; mission_day: number; recorded_at: string} & Record<string, unknown>
type TipItem = {name?: string; value?: unknown; color?: string; dataKey?: string | number; payload?: Row}

function VizTooltip({active, payload, units, extra}: {active?: boolean; payload?: TipItem[]; units: Record<string, string>; extra?: (row: Row) => ReactNode}) {
  if (!active || !payload?.length || !payload[0].payload) return null
  const row = payload[0].payload
  return (
    <div className="viz-tip">
      <div className="viz-tip-head"><strong>Mission day {row.mission_day}</strong><span>{utc(row.recorded_at)}</span></div>
      {payload.map(p => (
        <div className="viz-tip-row" key={String(p.dataKey)}>
          <i style={{background: p.color}} />
          <span>{p.name}</span>
          <b>{fmt(p.value)} {units[String(p.dataKey)] ?? ''}</b>
        </div>
      ))}
      {extra?.(row)}
    </div>
  )
}

const axisTick = {fill: VIZ.axis, fontSize: 11}
const xAxis = (
  <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={{stroke: VIZ.axisLine}} height={46} interval="preserveStartEnd" minTickGap={8}
    label={{value: 'Mission day', position: 'insideBottom', offset: 4, fill: VIZ.axis, fontSize: 11}} />
)

export type Swatch = {label: string; kind: 'line' | 'halo' | 'dash' | 'bar'; color: string}
export function VizLegend({items}: {items: Swatch[]}) {
  return (
    <ul className="viz-legend">
      {items.map(i => <li key={i.label}><i className={'sw-' + i.kind} style={{'--sw': i.color} as CSSProperties} />{i.label}</li>)}
    </ul>
  )
}

/** One physiological metric over mission days, against the personal baseline and an optional demo threshold. */
export function MetricChart({title, unit, field, data, baseline, threshold, height = 196}: {
  title: string; unit: string; field: string; data: Row[]; baseline?: number; threshold?: {value: number; label: string}; decimals?: number; height?: number
}) {
  const values = data.map(d => Number(d[field])).filter(Number.isFinite)
  const scale = niceScale([...values, ...(baseline !== undefined ? [baseline] : []), ...(threshold ? [threshold.value] : []), ...(values.length ? [] : [0, 1])])
  const legend: Swatch[] = [{label: 'Observed', kind: 'line', color: VIZ.s1}]
  if (baseline !== undefined) legend.push({label: `Personal baseline · ${baseline} ${unit}`, kind: 'dash', color: VIZ.baseline})
  if (threshold) legend.push({label: threshold.label, kind: 'dash', color: VIZ.caution})
  return (
    <figure className="viz">
      <figcaption className="viz-head"><span className="micro">{title}</span><span className="viz-unit">{unit}</span></figcaption>
      {data.length ? (
        <div className="viz-plot" style={{height}}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{top: 10, right: 12, bottom: 0, left: 0}}>
              <CartesianGrid stroke={VIZ.grid} vertical={false} />
              {xAxis}
              <YAxis width={50} tick={axisTick} tickLine={false} axisLine={false} domain={scale.domain} ticks={scale.ticks}
                tickFormatter={v => Number(v).toFixed(scale.decimals)}
                label={{value: unit, angle: -90, position: 'insideLeft', offset: 12, fill: VIZ.axis, fontSize: 11}} />
              <Tooltip cursor={{stroke: VIZ.axis, strokeWidth: 1}} isAnimationActive={false}
                content={<VizTooltip units={{[field]: unit}} extra={row => {
                  const v = Number(row[field])
                  return (
                    <>
                      {baseline !== undefined && Number.isFinite(v) && <div className="viz-tip-note">vs baseline {signed(v - baseline)} {unit}</div>}
                      {threshold && Number.isFinite(v) && v < threshold.value && <div className="viz-tip-note caution">Below demo indicator threshold</div>}
                    </>
                  )
                }} />} />
              {baseline !== undefined && <ReferenceLine y={baseline} stroke={VIZ.baseline} strokeDasharray="4 4" strokeWidth={1} />}
              {threshold && <ReferenceLine y={threshold.value} stroke={VIZ.caution} strokeDasharray="6 3" strokeWidth={1.5} />}
              <Area type="monotone" dataKey={field} name={title} stroke={VIZ.s1} strokeWidth={2} fill={VIZ.s1} fillOpacity={0.08} baseValue={scale.domain[0]}
                dot={{r: 4, fill: VIZ.s1, stroke: '#ffffff', strokeWidth: 2}} activeDot={{r: 5.5, fill: VIZ.s1, stroke: '#ffffff', strokeWidth: 2}} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : <div className="viz-empty">No observations recorded.</div>}
      <VizLegend items={legend} />
    </figure>
  )
}

/** Exercise session completion per mission day, against the 100% simulated session target. */
export function CompletionChart({data, height = 196}: {data: Row[]; height?: number}) {
  return (
    <figure className="viz">
      <figcaption className="viz-head"><span className="micro">Exercise session completion</span><span className="viz-unit">% of target</span></figcaption>
      {data.length ? (
        <div className="viz-plot" style={{height}}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{top: 10, right: 12, bottom: 0, left: 0}} barCategoryGap="28%">
              <CartesianGrid stroke={VIZ.grid} vertical={false} />
              {xAxis}
              <YAxis width={50} tick={axisTick} tickLine={false} axisLine={false} domain={[0, (max: number) => Math.max(100, Math.ceil(max / 25) * 25)]} ticks={[0, 25, 50, 75, 100]}
                label={{value: '%', angle: -90, position: 'insideLeft', offset: 12, fill: VIZ.axis, fontSize: 11}} />
              <Tooltip cursor={{fill: 'rgba(8,145,178,.07)'}} isAnimationActive={false} content={<VizTooltip units={{exercise_completion: '%'}} />} />
              <ReferenceLine y={100} stroke={VIZ.normal} strokeDasharray="6 3" strokeWidth={1.5} />
              <Bar dataKey="exercise_completion" name="Session completion" fill={VIZ.s1} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : <div className="viz-empty">No exercise sessions recorded.</div>}
      <VizLegend items={[{label: 'Completion', kind: 'bar', color: VIZ.s1}, {label: '100% simulated session target', kind: 'dash', color: VIZ.normal}]} />
    </figure>
  )
}

/** Self-reported wellbeing (1–5) over mission days with the configured fatigue review score. */
export function WellbeingChart({data, fatigueReview, height = 220}: {data: Row[]; fatigueReview?: number; height?: number}) {
  const units = {wellness: '/ 5', mood: '/ 5', fatigue: '/ 5'}
  const legend: Swatch[] = [
    {label: 'Wellness', kind: 'halo', color: VIZ.s1},
    {label: 'Mood', kind: 'line', color: VIZ.s2},
    {label: 'Fatigue (5 = high)', kind: 'line', color: VIZ.s3},
  ]
  if (fatigueReview !== undefined) legend.push({label: `Fatigue review score ≥ ${fatigueReview} (demo rule)`, kind: 'dash', color: VIZ.caution})
  const dot = (c: string) => ({r: 4, fill: c, stroke: '#ffffff', strokeWidth: 2})
  return (
    <figure className="viz">
      <figcaption className="viz-head"><span className="micro">Self-reported wellbeing</span><span className="viz-unit">score 1–5</span></figcaption>
      {data.length ? (
        <div className="viz-plot" style={{height}}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{top: 10, right: 12, bottom: 0, left: 0}}>
              <CartesianGrid stroke={VIZ.grid} vertical={false} />
              {xAxis}
              <YAxis width={50} tick={axisTick} tickLine={false} axisLine={false} domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} allowDecimals={false}
                label={{value: 'Score', angle: -90, position: 'insideLeft', offset: 12, fill: VIZ.axis, fontSize: 11}} />
              <Tooltip cursor={{stroke: VIZ.axis, strokeWidth: 1}} isAnimationActive={false}
                content={<VizTooltip units={units} extra={row => <div className="viz-tip-note">Symptoms: {String(row.symptoms ?? '—')}</div>} />} />
              <Line type="monotone" dataKey="wellness" name="Wellness" stroke={VIZ.s1} strokeWidth={7} strokeOpacity={0.35} dot={{r: 5, fill: VIZ.s1, fillOpacity: 0.45, stroke: '#ffffff', strokeWidth: 1}} activeDot={{...dot(VIZ.s1), r: 5.5}} isAnimationActive={false} />
              <Line type="monotone" dataKey="mood" name="Mood" stroke={VIZ.s2} strokeWidth={2} dot={dot(VIZ.s2)} activeDot={{...dot(VIZ.s2), r: 5.5}} isAnimationActive={false} />
              <Line type="monotone" dataKey="fatigue" name="Fatigue" stroke={VIZ.s3} strokeWidth={2} dot={dot(VIZ.s3)} activeDot={{...dot(VIZ.s3), r: 5.5}} isAnimationActive={false} />
              {fatigueReview !== undefined && <ReferenceLine y={fatigueReview} stroke={VIZ.caution} strokeDasharray="6 3" strokeWidth={1.5} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : <div className="viz-empty">No check-ins recorded.</div>}
      <VizLegend items={legend} />
    </figure>
  )
}
