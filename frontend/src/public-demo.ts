import snapshot from './public-demo-fixtures.json'
import type { Crew, Mission, Overview } from './data'

const mission: Mission = structuredClone(snapshot.fixtures['/mission'])
const overviews = new Map<number, Overview>([1, 2].map(id => {
  const overview = id === 1 ? snapshot.fixtures['/crew/1/overview'] : snapshot.fixtures['/crew/2/overview']
  return [id, structuredClone(overview) as Overview]
}))
const rules = structuredClone(snapshot.fixtures['/demo-rules'])
const conversations = new Map<string, unknown[]>()
let nextId = 1000
const response = (value: unknown, status = 200) => Response.json(value, { status })

const topics = /\b(bone[s]?|muscle[s]?|sleep|circadian|cardiovascular|isolation|psychological|behavioral|microgravity)\b/gi
function references(query: string, mode?: string) {
  const terms = [...query.toLowerCase().matchAll(topics)].map(match => match[0].replace(/s$/, ''))
  return snapshot.sources.filter(source => {
    const passage = (source.title + ' ' + source.text).toLowerCase()
    return terms.some(term => passage.includes(term)) &&
      (mode !== 'psychologist' || /sleep|isolation|behavioral|psychological|circadian/.test(passage))
  }).slice(0, 3)
}

export function demoFetch(input: RequestInfo | URL, init: RequestInit): Response {
  if (init.signal?.aborted) throw init.signal.reason
  const { pathname, searchParams } = new URL(String(input), location.origin)
  const path = pathname.replace(/^\/api/, '')
  const method = init.method ?? 'GET'
  const body = init.body ? JSON.parse(String(init.body)) : {}
  const stamp = new Date().toISOString()
  if (path === '/readiness') return response({ ready: true })
  if (path === '/ai/status') return response({ ready: false })
  if (path === '/documents/search') return response(references(searchParams.get('q') ?? ''))
  if (path === '/mission') {
    if (method === 'PUT') Object.assign(mission, body)
    return response(mission)
  }
  if (path === '/demo-rules') {
    if (method === 'PUT') Object.assign(rules, body)
    return response(rules)
  }
  if (path === '/crew') {
    if (method === 'POST') {
      const crew: Crew = { id: nextId++, name: body.name, role: body.role }
      const start = overviews.get(1)!
      overviews.set(crew.id, { ...structuredClone(start), crew, baselines: {}, measurements: [],
        checkins: [], encounters: [], demo_indicators: [] })
      return response(crew, 201)
    }
    return response([...overviews.values()].map(item => item.crew))
  }
  const match = /^\/crew\/(\d+)(?:\/(.*))?$/.exec(path)
  const overview = match && overviews.get(Number(match[1]))
  if (!overview) return response({ detail: 'Demo route unavailable.' }, 404)
  const action = match[2]
  if (!action && method === 'PUT') return response(Object.assign(overview.crew, body))
  if (action === 'overview') return response({ ...overview, demo_rules: rules })
  if (action === 'baselines' && method === 'PUT') {
    overview.baselines[body.metric] = body.value
    return response(overview.baselines)
  }
  if (method === 'POST') {
    const row = { ...body, id: nextId++, recorded_at: stamp, mission_day: mission.mission_day }
    if (action === 'encounters') { overview.encounters.push(row); return response(row, 201) }
    if (action === 'measurements') { overview.measurements.push(row); return response(row, 201) }
    if (action === 'checkins') { overview.checkins.push(row); return response(row, 201) }
  }
  const encounter = /^encounters\/(\d+)\/(chat|conversation)$/.exec(action ?? '')
  if (encounter && overview.encounters.some(row => row.id === Number(encounter[1]))) {
    const mode = body.mode ?? searchParams.get('mode')
    const purpose = body.purpose ?? searchParams.get('purpose')
    const key = [overview.crew.id, encounter[1], mode, purpose].join('/')
    const records = conversations.get(key) ?? []
    if (encounter[2] === 'conversation') return response(records)
    if (method === 'POST') {
      const question = String(body.question ?? '').slice(0, 1200)
      const blocked = /diagnos|prescri|dosage|\bdose\b|\bdrug\b|medication|treatment|instruction|system prompt/i.test(question)
      const citations = blocked || mode === 'pharmacist' ? [] : references(question, mode)
      const answer = mode === 'pharmacist'
        ? 'Question recorded in this tab. The pharmacist simulation abstains from medication guidance.'
        : citations.length ? 'Deterministic educational example. The NASA excerpts below provide general spaceflight background for a discussion with a human mission lead.'
          : 'No matching reviewed excerpt. This educational simulation cannot diagnose, prescribe, or provide treatment instructions.'
      const record = { question, mode, answer, citations, observations: [], memories: [],
        created_at: stamp, status: citations.length ? 'grounded' : 'abstained' }
      records.push(record)
      conversations.set(key, records)
      return response(record)
    }
  }
  return response({ detail: 'This action is unavailable in the public demo.' }, 404)
}
