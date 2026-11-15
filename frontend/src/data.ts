import { authenticatedFetch } from './Auth'

export type Crew = { id: number; name: string; role: string }
export type Measurement = {
  id: number; recorded_at: string; mission_day: number; heart_rate: number; hrv: number
  sleep_hours: number; exercise_minutes: number; exercise_completion: number
}
export type Checkin = {
  id: number; recorded_at: string; mission_day: number; wellness: number
  fatigue: number; mood: number; symptoms: string; notes: string
}
export type Encounter = { id: number; recorded_at: string; mission_day: number; title: string; notes: string }
export type Overview = {
  crew: Crew; baselines: Record<string, number>; measurements: Measurement[]
  checkins: Checkin[]; encounters: Encounter[]; demo_indicators: string[]
  demo_rules: { sleep_baseline_fraction: number; fatigue_review_score: number }
  mission_context: { scenario: 'LUNA-01'; phase: string; mission_day: number; gravity_context: string; evidence_scope: string } | null
}
export type Mission = { name: string; destination: string; mission_day: number }

export class RequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly fields: Record<string, string> = {}) {
    super(message)
  }
}

export async function api<T>(path: string, method = 'GET', value?: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(15000)
  const response = await authenticatedFetch('/api' + path, {
    method,
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    ...(value === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }),
  })
  if (!response.ok) {
    const error: { detail?: string | { loc?: unknown[]; msg?: unknown }[] } | null = await response.json().catch(() => null)
    const fields = Object.fromEntries(Array.isArray(error?.detail)
      ? error.detail.filter((item) => item.loc?.[0] === 'body' && typeof item.loc[1] === 'string')
        .map((item) => [String(item.loc?.[1]), typeof item.msg === 'string' ? item.msg : 'Check this value.'])
      : [])
    throw new RequestError(
      typeof error?.detail === 'string' ? error.detail : `Request failed (${response.status}).`,
      response.status,
      fields,
    )
  }
  return response.json()
}

const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
})
export const formatTime = (time: string) => dateTime.format(new Date(time)) + ' UTC'

export const metrics = [
  { key: 'heart_rate', label: 'Resting heart rate', unit: 'bpm', min: 0, exclusiveMin: true, max: 300 },
  { key: 'hrv', label: 'Heart rate variability', unit: 'ms', min: 0, max: 500 },
  { key: 'sleep_hours', label: 'Sleep duration', unit: 'h', min: 0, max: 24 },
  { key: 'exercise_minutes', label: 'Exercise duration', unit: 'min', min: 0, max: 1440 },
] as const

export type Editor = 'checkin' | 'measurement' | 'encounter' | 'profile' | 'newcrew' | 'baseline' | 'mission' | 'rules'
export type DialogName = Editor | 'about'
type Field = {
  name: string; label: string; value?: string | number; type?: 'number' | 'textarea'
  required?: boolean; maxLength?: number; min?: number; max?: number
  exclusiveMin?: boolean; integer?: boolean; options?: { value: string | number; label: string }[]
  placeholder?: string
}
type FormDefinition = {
  title: string; action: string; confirmation: string; path: string; method: 'POST' | 'PUT'
  fields: Field[]; description?: string
}

export function getEditor(editor: Editor, mission: Mission | null, overview: Overview | null): FormDefinition {
  const crewPath = `/crew/${overview?.crew.id}`
  const latest = overview?.measurements.at(-1)
  const profileFields: Field[] = [
    { name: 'name', label: 'Name', required: true, maxLength: 100, value: editor === 'profile' ? overview?.crew.name : '' },
    { name: 'role', label: 'Role', required: true, maxLength: 100, value: editor === 'profile' ? overview?.crew.role : '' },
  ]
  switch (editor) {
    case 'profile':
      return { title: 'Edit profile', action: 'Save profile', confirmation: 'Profile updated', path: crewPath, method: 'PUT', fields: profileFields }
    case 'newcrew':
      return { title: 'Add fictional crew member', action: 'Add crew member', confirmation: 'Crew member added', path: '/crew', method: 'POST', fields: profileFields }
    case 'checkin':
      return {
        title: 'Daily check-in', action: 'Save check-in', confirmation: 'Check-in recorded', path: crewPath + '/checkins', method: 'POST',
        description: 'Scores range from 1 (low) to 5 (high).',
        fields: [
          ...['Wellness', 'Mood', 'Fatigue'].map(label => ({
            name: label.toLowerCase(), label, value: label === 'Fatigue' ? 2 : 4,
            options: [1, 2, 3, 4, 5].map(value => ({ value, label: String(value) })),
          })),
          { name: 'symptoms', label: 'Symptoms', maxLength: 1000, placeholder: 'None reported' },
          { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 2000 },
        ],
      }
    case 'measurement':
      return {
        title: 'Log measurements', action: 'Save measurements', confirmation: 'Measurements recorded', path: crewPath + '/measurements', method: 'POST',
        fields: [
          ...metrics.map(metric => ({
            ...metric, name: metric.key, label: `${metric.label} (${metric.unit})`,
            type: 'number' as const, required: true, value: latest?.[metric.key],
          })),
          { name: 'exercise_completion', label: 'Exercise completion (%)', type: 'number', required: true, min: 0, max: 100, value: latest?.exercise_completion },
        ],
      }
    case 'encounter':
      return {
        title: 'Record event', action: 'Save event', confirmation: 'Event recorded', path: crewPath + '/encounters', method: 'POST',
        fields: [{ name: 'title', label: 'Event title', required: true, maxLength: 120 }, { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 2000 }],
      }
    case 'baseline':
      return {
        title: 'Edit personal baseline', action: 'Save baseline', confirmation: 'Personal baseline updated', path: crewPath + '/baselines', method: 'PUT',
        fields: [
          { name: 'metric', label: 'Metric', options: metrics.map(metric => ({ value: metric.key, label: `${metric.label} (${metric.unit})` })) },
          { name: 'value', label: 'Personal baseline value', type: 'number', min: 0, exclusiveMin: true, max: 1000, required: true },
        ],
      }
    case 'mission':
      return {
        title: 'Mission settings', action: 'Save mission', confirmation: 'Mission settings updated', path: '/mission', method: 'PUT',
        description: 'Mission day is the simulation clock used for new records.',
        fields: [
          { name: 'name', label: 'Mission name', required: true, maxLength: 100, value: mission?.name },
          { name: 'destination', label: 'Destination', required: true, maxLength: 100, value: mission?.destination },
          { name: 'mission_day', label: 'Mission day', type: 'number', min: 1, max: 10000, integer: true, required: true, value: mission?.mission_day },
        ],
      }
    case 'rules':
      return {
        title: 'Demonstration rules', action: 'Save rules', confirmation: 'Demonstration rules updated', path: '/demo-rules', method: 'PUT',
        description: 'These settings apply only to the simulation and have no clinical use.',
        fields: [
          { name: 'sleep_baseline_fraction', label: 'Sleep threshold (fraction of baseline)', type: 'number', min: 0, exclusiveMin: true, max: 1, required: true, value: overview?.demo_rules.sleep_baseline_fraction },
          { name: 'fatigue_review_score', label: 'Fatigue threshold (at or above)', type: 'number', min: 1, max: 5, integer: true, required: true, value: overview?.demo_rules.fatigue_review_score },
        ],
      }
  }
}

export function parseField(field: Field, control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const input = control.value.trim()
  if (control.validity.badInput) return { error: 'Enter a number.' }
  if (field.required && !input) return { error: 'Enter a value.' }
  if (field.maxLength && input.length > field.maxLength) return { error: `Use ${field.maxLength} characters or fewer.` }
  if (field.type !== 'number' && typeof field.options?.[0]?.value !== 'number') return { value: input }
  const value = Number(input)
  if (!Number.isFinite(value) || (field.integer && !Number.isInteger(value))) {
    return { error: field.integer ? 'Enter a whole number.' : 'Enter a number.' }
  }
  if (field.min !== undefined && (field.exclusiveMin ? value <= field.min : value < field.min)) {
    return { error: field.exclusiveMin ? `Enter a number greater than ${field.min}.` : `Enter ${field.min} or more.` }
  }
  if (field.max !== undefined && value > field.max) return { error: `Enter ${field.max} or less.` }
  return { value }
}
