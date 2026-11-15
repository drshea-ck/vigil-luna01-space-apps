import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Dumbbell, Heart, Moon } from 'lucide-react'
import { formatTime, type Measurement } from './data'

const channels = [
  { field: 'heart_rate', label: 'Resting heart rate', unit: 'bpm', icon: Heart },
  { field: 'hrv', label: 'Heart rate variability', unit: 'ms', icon: Activity },
  { field: 'sleep_hours', label: 'Sleep duration', unit: 'hrs', icon: Moon },
  { field: 'exercise_minutes', label: 'Exercise duration', unit: 'min', icon: Dumbbell },
] as const

export default function TelemetryCards({ measurements, baselines, range = 14 }: {
  measurements: Measurement[]; baselines: Record<string, number>; range?: number
}) {
  const latest = measurements.at(-1)
  const rows = measurements.slice(-range)
  return <>
    <div className="telemetry-grid">
      {channels.map(({ field, label, unit, icon: Icon }) => {
        const value = latest?.[field], base = baselines[field]
        const hasBase = Number.isFinite(base)
        const delta = value !== undefined && hasBase ? value - base : undefined
        const DeltaIcon = delta === 0 ? ArrowRight : (delta ?? 0) > 0 ? ArrowUpRight : ArrowDownRight
        const values = rows.map(row => row[field])
        const domain = [...values, ...(hasBase ? [base] : [])]
        const lo = Math.min(...domain), hi = Math.max(...domain)
        const span = hi - lo || 1
        const y = (n: number) => 65 - (n - lo) / span * 48
        const points = values.map((n, i) => `${values.length === 1 ? 130 : 8 + i / (values.length - 1) * 244},${y(n)}`).join(' ')
        return <article className={`telemetry-card telemetry-${field}`} key={field} aria-label={label}>
          <h4><span className="telemetry-icon"><Icon size={20} aria-hidden="true" /></span>{label}</h4>
          <p className="telemetry-value num">{value ?? '—'}<span>{unit}</span></p>
          <p className="telemetry-baseline">Personal baseline <b>{hasBase ? `${base} ${unit}` : 'Not set'}</b></p>
          <p className="telemetry-delta">{delta === undefined ? 'No observation or baseline' : <><span><DeltaIcon size={14} aria-hidden="true" />{delta > 0 ? '+' : ''}{delta.toFixed(1)} {unit}</span> from baseline</>}</p>
          {values.length ? <svg className="telemetry-spark" viewBox="0 0 260 82" role="img" aria-label={`${label}: ${values.length} latest observations${hasBase ? `; dashed personal baseline ${base} ${unit}` : ''}`}>
            {hasBase && <line x1="8" x2="252" y1={y(base)} y2={y(base)} className="spark-baseline" />}
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
            {values.length === 1 && <circle cx="130" cy={y(values[0])} r="3" fill="currentColor" />}
          </svg> : <p className="telemetry-no-data">No observations recorded</p>}
          <details className="telemetry-history"><summary>{rows.length} observations · view values</summary><ol>{rows.map(row => <li key={row.id}>Day {row.mission_day}: <b>{row[field]} {unit}</b> · {formatTime(row.recorded_at)}</li>)}</ol></details>
        </article>
      })}
    </div>
    <p className="ws-note num">{latest ? `Latest observation: ${formatTime(latest.recorded_at)} · Exercise completion: ${latest.exercise_completion}% of simulated session target` : 'No measurements recorded'}</p>
    <p className="ws-foot">Synthetic observations. Dashed lines show personal baselines, not clinical thresholds.</p>
  </>
}
