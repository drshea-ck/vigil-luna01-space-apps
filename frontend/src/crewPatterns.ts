// Crew Health Interdependency Map: deterministic shared-pattern detection.
// Pure functions, no I/O. Inputs are the per-crew overviews the signed-in user is already allowed
// to read (/api/crew filters by clinical_read; each overview is permission-checked).
// Only recorded NUMBERS are used: free-text symptoms, notes, encounters, memories and the private
// store are never read here, so they can never surface on the shared map.
import {PHASES, phaseOf} from './missionPlan.ts'

export type Measurement = {id: number; recorded_at: string; mission_day: number; heart_rate: number; hrv: number; sleep_hours: number; exercise_minutes: number; exercise_completion: number}
export type Checkin = {id: number; recorded_at: string; mission_day: number; wellness: number; fatigue: number; mood: number}
export type CrewRecord = {crew: {id: number; name: string; role: string}; synthetic?: boolean; baselines: Record<string, number>; measurements: Measurement[]; checkins: Checkin[]}
export type Rules = {sleep_baseline_fraction: number; fatigue_review_score: number}
export type DayRange = {from: number; to: number}
export type Category = 'sleep' | 'fatigue' | 'wellbeing' | 'cardiovascular' | 'activity'
export const CATEGORIES: Category[] = ['sleep', 'fatigue', 'wellbeing', 'cardiovascular', 'activity']

export type Point = {day: number; at: string; value: number; reference?: number}
export type Signal = {id: string; category: Category; name: string; rule: string; crewId: number; firstDay: number; lastDay: number; firstAt: string; lastAt: string; observations: number; points: Point[]}
export type Factor = {phaseId: string; label: string; kind: 'possible' | 'unconfirmed'; reason: string}
export type Pattern = {
  id: string; signalId: string; category: Category; name: string; rule: string
  crewIds: number[]; firstDay: number; lastDay: number; firstAt: string; lastAt: string
  emerging: boolean; sufficiency: 'limited' | 'moderate'; sufficiencyReason: string
  support: {crewId: number; observations: number; points: Point[]}[]
  factor: Factor | null
}
export type CrewSummary = {
  crewId: number; name: string; role: string; synthetic: boolean
  measurementCount: number; checkinCount: number; firstDay: number | null; lastDay: number | null
  latestWellness: number | null; latestWellnessDay: number | null
  availability: 'full' | 'partial' | 'none'
  signals: (Signal & {shared: boolean})[]; patternIds: string[]
}
export type CrewMap = {
  range: DayRange; currentDay: number
  crew: CrewSummary[]; patterns: Pattern[]
  factors: {phaseId: string; label: string; range: string; patternIds: string[]}[]
  insights: {crewCount: number; patternCount: number; crewInvolved: number; emerging: string[]; limitations: string[]}
}

type Def = {
  id: string; category: Category; name: string; rule: string; source: 'measurements' | 'checkins'; field: string
  threshold?: (value: number, baseline: number | undefined, rules: Rules) => boolean
  reference?: (baseline: number | undefined, rules: Rules) => number | undefined
  baselineKey?: string
  slope?: (perDay: number) => boolean
}

// Demonstration detection rules: arithmetic on recorded values, not clinical thresholds.
export const RULES: Def[] = [
  {id: 'sleep_below_baseline', category: 'sleep', name: 'Sleep below personal baseline', source: 'measurements', field: 'sleep_hours', baselineKey: 'sleep_hours',
    rule: '2+ nights below personal baseline × configured demo fraction',
    threshold: (v, b, r) => b !== undefined && v < b * r.sleep_baseline_fraction, reference: (b, r) => (b === undefined ? undefined : b * r.sleep_baseline_fraction)},
  {id: 'sleep_declining', category: 'sleep', name: 'Declining sleep duration', source: 'measurements', field: 'sleep_hours',
    rule: 'Sleep trend ≤ −0.1 h per day over 4+ nights', slope: s => s <= -0.1},
  {id: 'fatigue_review', category: 'fatigue', name: 'Fatigue at review score', source: 'checkins', field: 'fatigue',
    rule: '2+ check-ins at or above the configured demo review score',
    threshold: (v, _b, r) => v >= r.fatigue_review_score, reference: (_b, r) => r.fatigue_review_score},
  {id: 'fatigue_rising', category: 'fatigue', name: 'Rising fatigue reports', source: 'checkins', field: 'fatigue',
    rule: 'Fatigue trend ≥ +0.15 points per day over 4+ check-ins', slope: s => s >= 0.15},
  {id: 'wellness_declining', category: 'wellbeing', name: 'Declining self-reported wellness', source: 'checkins', field: 'wellness',
    rule: 'Wellness trend ≤ −0.15 points per day over 4+ check-ins', slope: s => s <= -0.15},
  {id: 'mood_declining', category: 'wellbeing', name: 'Declining self-reported mood', source: 'checkins', field: 'mood',
    rule: 'Mood trend ≤ −0.15 points per day over 4+ check-ins', slope: s => s <= -0.15},
  {id: 'hrv_below_baseline', category: 'cardiovascular', name: 'HRV below personal baseline', source: 'measurements', field: 'hrv', baselineKey: 'hrv',
    rule: '2+ observations more than 10% below personal baseline',
    threshold: (v, b) => b !== undefined && v < b * 0.9, reference: b => (b === undefined ? undefined : b * 0.9)},
  {id: 'hr_above_baseline', category: 'cardiovascular', name: 'Resting heart rate above baseline', source: 'measurements', field: 'heart_rate', baselineKey: 'heart_rate',
    rule: '2+ observations more than 10% above personal baseline',
    threshold: (v, b) => b !== undefined && v > b * 1.1, reference: b => (b === undefined ? undefined : b * 1.1)},
  {id: 'exercise_below_target', category: 'activity', name: 'Exercise sessions below target', source: 'measurements', field: 'exercise_completion',
    rule: '2+ sessions under 80% of the simulated session target',
    threshold: v => v < 80, reference: () => 80},
]

const round = (v: number) => Math.round(v * 100) / 100
const inRange = (day: number, r: DayRange) => day >= r.from && day <= r.to

function slopePerDay(points: Point[]) {
  const n = points.length, mx = points.reduce((a, p) => a + p.day, 0) / n, my = points.reduce((a, p) => a + p.value, 0) / n
  const den = points.reduce((a, p) => a + (p.day - mx) ** 2, 0)
  return den === 0 ? 0 : points.reduce((a, p) => a + (p.day - mx) * (p.value - my), 0) / den
}

/** Signals for ONE crew member, computed only from that member's own records. */
export function detectSignals(record: CrewRecord, rules: Rules, range: DayRange): Signal[] {
  const out: Signal[] = []
  for (const def of RULES) {
    const rows = (record[def.source] as unknown as Record<string, number | string>[])
      .filter(r => inRange(Number(r.mission_day), range))
      .sort((a, b) => Number(a.mission_day) - Number(b.mission_day) || String(a.recorded_at).localeCompare(String(b.recorded_at)))
    const baseline = def.baselineKey ? record.baselines[def.baselineKey] : undefined
    if (def.baselineKey && baseline === undefined) continue
    const all: Point[] = rows.map(r => ({day: Number(r.mission_day), at: String(r.recorded_at), value: Number(r[def.field])}))
    let points: Point[] = []
    if (def.threshold) {
      const ref = def.reference?.(baseline, rules)
      points = all.filter(p => def.threshold!(p.value, baseline, rules)).map(p => ({...p, reference: ref === undefined ? undefined : round(ref)}))
      if (points.length < 2) continue
    } else if (def.slope) {
      if (all.length < 4 || !def.slope(slopePerDay(all))) continue
      points = all
    }
    out.push({id: def.id, category: def.category, name: def.name, rule: def.rule, crewId: record.crew.id,
      firstDay: points[0].day, lastDay: points[points.length - 1].day, firstAt: points[0].at, lastAt: points[points.length - 1].at,
      observations: points.length, points})
  }
  return out
}

/** Cluster one signal across crew by overlapping day windows (a non-empty common interval). */
function overlapClusters(signals: Signal[]): Signal[][] {
  const sorted = [...signals].sort((a, b) => a.firstDay - b.firstDay || a.crewId - b.crewId)
  const clusters: Signal[][] = []
  let current: Signal[] = [], lo = -Infinity, hi = Infinity
  for (const s of sorted) {
    if (current.length && Math.max(lo, s.firstDay) <= Math.min(hi, s.lastDay)) {
      current.push(s); lo = Math.max(lo, s.firstDay); hi = Math.min(hi, s.lastDay)
    } else {
      if (current.length) clusters.push(current)
      current = [s]; lo = s.firstDay; hi = s.lastDay
    }
  }
  if (current.length) clusters.push(current)
  return clusters
}

function phaseFactor(members: Signal[], planned: boolean): Factor | null {
  if (!planned) return null
  const phases = members.map(m => phaseOf(m.firstDay))
  const first = [...members].sort((a, b) => a.firstDay - b.firstDay)[0]
  const earliest = phaseOf(first.firstDay)
  if (phases.every(p => p.id === phases[0].id)) {
    return {phaseId: phases[0].id, label: phases[0].condition, kind: 'possible',
      reason: `Onset for all ${members.length} crew falls in ${phases[0].condition} (${phases[0].range}). This is a timing overlap only, not evidence of a cause.`}
  }
  const names = [...new Set(phases.map(p => p.condition))].join(' and ')
  return {phaseId: earliest.id, label: earliest.condition, kind: 'unconfirmed',
    reason: `Onsets span ${names}. Timing alone is insufficient to relate this pattern to a mission condition.`}
}

export function buildCrewMap(records: CrewRecord[], rules: Rules, range: DayRange, mission: {name: string; mission_day: number} | null): CrewMap {
  const planned = !!mission?.name.startsWith('LUNA-01')
  const currentDay = Math.min(mission?.mission_day ?? range.to, range.to)
  const signalsByCrew = new Map<number, Signal[]>()
  for (const r of records) signalsByCrew.set(r.crew.id, detectSignals(r, rules, range))

  const bySignal = new Map<string, Signal[]>()
  for (const list of signalsByCrew.values()) for (const s of list) bySignal.set(s.id, [...(bySignal.get(s.id) ?? []), s])

  const patterns: Pattern[] = []
  for (const def of RULES) {
    const clusters = overlapClusters(bySignal.get(def.id) ?? []).filter(c => new Set(c.map(s => s.crewId)).size >= 2)
    clusters.forEach((members, i) => {
      const first = [...members].sort((a, b) => a.firstDay - b.firstDay || a.firstAt.localeCompare(b.firstAt))[0]
      const last = [...members].sort((a, b) => b.lastDay - a.lastDay || b.lastAt.localeCompare(a.lastAt))[0]
      const minObs = Math.min(...members.map(m => m.observations))
      const moderate = members.length >= 3 && minObs >= 4
      patterns.push({id: `${def.id}#${i + 1}`, signalId: def.id, category: def.category, name: def.name, rule: def.rule,
        crewIds: members.map(m => m.crewId).sort((a, b) => a - b),
        firstDay: first.firstDay, lastDay: last.lastDay, firstAt: first.firstAt, lastAt: last.lastAt,
        emerging: first.firstDay >= currentDay - 2,
        sufficiency: moderate ? 'moderate' : 'limited',
        sufficiencyReason: `${members.length} crew, at least ${minObs} qualifying observation${minObs === 1 ? '' : 's'} each, synthetic records${moderate ? '' : ' (small sample)'}.`,
        support: members.map(m => ({crewId: m.crewId, observations: m.observations, points: m.points})),
        factor: phaseFactor(members, planned)})
    })
  }

  const inPattern = (crewId: number, signalId: string) => patterns.some(p => p.signalId === signalId && p.crewIds.includes(crewId))
  const crew: CrewSummary[] = records.map(r => {
    const m = r.measurements.filter(x => inRange(x.mission_day, range)), c = r.checkins.filter(x => inRange(x.mission_day, range))
    const days = [...m, ...c].map(x => x.mission_day)
    const latest = [...c].sort((a, b) => a.mission_day - b.mission_day || a.recorded_at.localeCompare(b.recorded_at)).at(-1)
    return {crewId: r.crew.id, name: r.crew.name, role: r.crew.role, synthetic: r.synthetic !== false,
      measurementCount: m.length, checkinCount: c.length,
      firstDay: days.length ? Math.min(...days) : null, lastDay: days.length ? Math.max(...days) : null,
      latestWellness: latest ? latest.wellness : null, latestWellnessDay: latest ? latest.mission_day : null,
      availability: !m.length && !c.length ? 'none' : m.length >= 4 && c.length >= 4 ? 'full' : 'partial',
      signals: (signalsByCrew.get(r.crew.id) ?? []).map(s => ({...s, shared: inPattern(r.crew.id, s.id)})),
      patternIds: patterns.filter(p => p.crewIds.includes(r.crew.id)).map(p => p.id)}
  })

  const factors = planned ? PHASES.map(ph => ({phaseId: ph.id, label: ph.condition, range: ph.range, patternIds: patterns.filter(p => p.factor?.phaseId === ph.id).map(p => p.id)})).filter(f => f.patternIds.length) : []
  const withData = crew.filter(c => c.availability !== 'none').length
  const limitations = [
    'All crew and records are synthetic (fictional).',
    ...(withData < 2 ? [`Shared patterns need at least two crew members with records in this range; ${withData} ${withData === 1 ? 'has' : 'have'} records.`] : []),
    ...(crew.some(c => c.availability === 'none') ? [`${crew.filter(c => c.availability === 'none').length} permitted crew member(s) have no records in this range.`] : []),
    'Detection uses configurable demonstration rules on recorded numbers, not clinical thresholds.',
    'No stress measure is recorded; self-reported mood is the closest available signal.',
    'Free-text symptoms, notes, encounters and private records are never used or shown here.',
    'A shared pattern or phase overlap is not evidence of a common cause.',
    ...(planned ? [] : ['Mission-phase factors are only available for the LUNA-01 plan.']),
  ]
  return {range, currentDay, crew, patterns, factors,
    insights: {crewCount: crew.length, patternCount: patterns.length, crewInvolved: new Set(patterns.flatMap(p => p.crewIds)).size,
      emerging: patterns.filter(p => p.emerging).map(p => p.id), limitations}}
}
