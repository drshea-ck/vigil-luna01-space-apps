// node --test src/crewPatterns.test.ts  (Node 22.18+/24: native TypeScript type stripping)
// Fixtures below are test-only synthetic crews; nothing is written to any database.
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {buildCrewMap, detectSignals, type CrewRecord, type Rules} from './crewPatterns.ts'

const RULES: Rules = {sleep_baseline_fraction: 0.85, fatigue_review_score: 4}
const ALL = {from: -6, to: 8}
const LUNA = {name: 'LUNA-01 - Lunar Surface Health Companion', mission_day: 7}

function crew(id: number, sleep: (day: number) => number, fatigue: (day: number) => number = () => 2, extra: Partial<CrewRecord> = {}): CrewRecord {
  const days = Array.from({length: 14}, (_, i) => i - 6)
  return {
    crew: {id, name: `Crew ${id}`, role: 'Synthetic role'}, synthetic: true,
    baselines: {sleep_hours: 8, hrv: 58, heart_rate: 62, exercise_minutes: 90},
    measurements: days.map(d => ({id: id * 100 + d + 10, recorded_at: `2026-11-${String(d + 10).padStart(2, '0')}T08:00:00Z`, mission_day: d,
      heart_rate: 62, hrv: 58, sleep_hours: sleep(d), exercise_minutes: 90, exercise_completion: 95})),
    checkins: days.map(d => ({id: id * 100 + d + 10, recorded_at: `2026-11-${String(d + 10).padStart(2, '0')}T09:00:00Z`, mission_day: d,
      wellness: 4, fatigue: fatigue(d), mood: 4,
      // free text present in the input must never reach the map output
      symptoms: 'PRIVATE-SYMPTOM-TEXT', notes: 'PRIVATE-NOTE-TEXT'} as never)),
    ...extra,
  }
}
const shortSleepInTransit = (d: number) => (d >= 1 && d <= 3 ? 6.2 : 7.9)

test('single crew member: no shared pattern, limitation explains why', () => {
  const map = buildCrewMap([crew(1, shortSleepInTransit)], RULES, ALL, LUNA)
  assert.equal(map.patterns.length, 0)
  assert.equal(map.crew[0].signals.find(s => s.id === 'sleep_below_baseline')?.shared, false)
  assert.ok(map.insights.limitations.some(l => l.includes('at least two crew members')))
})

test('two crew with overlapping short sleep form an observed-overlap pattern with a possible phase association', () => {
  const map = buildCrewMap([crew(1, shortSleepInTransit), crew(2, shortSleepInTransit), crew(3, () => 7.9)], RULES, ALL, LUNA)
  const p = map.patterns.find(x => x.signalId === 'sleep_below_baseline')
  assert.ok(p, 'pattern detected')
  assert.deepEqual(p.crewIds, [1, 2])
  assert.equal(p.firstDay, 1); assert.equal(p.lastDay, 3)
  assert.equal(p.sufficiency, 'limited')
  assert.equal(p.factor?.kind, 'possible'); assert.equal(p.factor?.phaseId, 'transit')
  assert.match(p.factor!.reason, /not evidence of a cause/)
  assert.equal(map.crew.find(c => c.crewId === 3)?.patternIds.length, 0)
  assert.equal(map.insights.crewInvolved, 2)
})

test('non-overlapping windows are not merged into one pattern', () => {
  const early = (d: number) => (d >= -6 && d <= -4 ? 6 : 7.9)
  const late = (d: number) => (d >= 5 && d <= 7 ? 6 : 7.9)
  const map = buildCrewMap([crew(1, early), crew(2, late)], RULES, ALL, LUNA)
  assert.equal(map.patterns.filter(p => p.signalId === 'sleep_below_baseline').length, 0)
})

test('onsets in different phases give an unconfirmed relationship', () => {
  const a = (d: number) => (d >= -1 && d <= 2 ? 6 : 7.9)   // onset in pre-launch
  const b = (d: number) => (d >= 1 && d <= 3 ? 6 : 7.9)    // onset in transit
  const map = buildCrewMap([crew(1, a), crew(2, b)], RULES, ALL, LUNA)
  const p = map.patterns.find(x => x.signalId === 'sleep_below_baseline')!
  assert.equal(p.factor?.kind, 'unconfirmed')
})

test('three crew with 4+ qualifying observations reach moderate sufficiency; emerging flag uses current day', () => {
  const recent = (d: number) => (d >= 4 ? 4 : 2)
  const map = buildCrewMap([crew(1, () => 7.9, recent), crew(2, () => 7.9, recent), crew(3, () => 7.9, recent)], RULES, ALL, LUNA)
  const p = map.patterns.find(x => x.signalId === 'fatigue_review')!
  assert.equal(p.sufficiency, 'moderate')
  assert.equal(p.emerging, false) // onset day 4 < current day 7 - 2
  const late = buildCrewMap([crew(1, () => 7.9, d => (d >= 6 ? 4 : 2)), crew(2, () => 7.9, d => (d >= 6 ? 4 : 2))], RULES, ALL, LUNA)
  assert.equal(late.patterns.find(x => x.signalId === 'fatigue_review')?.emerging, true)
})

test('time range filters observations before detection', () => {
  const map = buildCrewMap([crew(1, shortSleepInTransit), crew(2, shortSleepInTransit)], RULES, {from: 4, to: 8}, LUNA)
  assert.equal(map.patterns.length, 0)
  assert.equal(map.crew[0].measurementCount, 4) // fixture runs day -6..7, so days 4..7
})

test('signals are computed from each crew member\'s own records only', () => {
  const a = crew(1, shortSleepInTransit), b = crew(2, () => 7.9)
  const sa = detectSignals(a, RULES, ALL), sb = detectSignals(b, RULES, ALL)
  assert.ok(sa.every(s => s.crewId === 1 && s.points.every(p => a.measurements.some(m => m.recorded_at === p.at) || a.checkins.some(c => c.recorded_at === p.at))))
  assert.equal(sb.filter(s => s.id === 'sleep_below_baseline').length, 0)
})

test('free-text symptoms and notes never appear in the map output', () => {
  const map = buildCrewMap([crew(1, shortSleepInTransit), crew(2, shortSleepInTransit)], RULES, ALL, LUNA)
  const json = JSON.stringify(map)
  assert.ok(!json.includes('PRIVATE-SYMPTOM-TEXT') && !json.includes('PRIVATE-NOTE-TEXT'))
})

test('missing baselines skip baseline rules and empty records are reported, not invented', () => {
  const noBase = crew(1, shortSleepInTransit, undefined, {baselines: {}})
  const empty = crew(2, () => 8, undefined, {measurements: [], checkins: []})
  const map = buildCrewMap([noBase, empty], RULES, ALL, LUNA)
  assert.equal(map.crew[0].signals.some(s => s.id === 'sleep_below_baseline'), false)
  assert.equal(map.crew[1].availability, 'none')
  assert.ok(map.insights.limitations.some(l => l.includes('no records')))
})

test('non-LUNA missions get no phase factors', () => {
  const map = buildCrewMap([crew(1, shortSleepInTransit), crew(2, shortSleepInTransit)], RULES, ALL, {name: 'Other mission', mission_day: 7})
  assert.equal(map.factors.length, 0)
  assert.equal(map.patterns[0].factor, null)
})
