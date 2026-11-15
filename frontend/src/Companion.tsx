import { BookOpen, MessageSquare, Plus, Radio, ShieldCheck, Sparkles } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { authenticatedFetch } from './Auth'
import MemoryPanel from './Memory'
import { SupportPortrait, supportModes, type SupportMode } from './SupportPortrait'
import InteractiveAvatar3D from './InteractiveAvatar3D'
import './companion.css'

const CompanionView = lazy(() => import('./CompanionView'))
const publicDemo = import.meta.env.MODE === 'space-apps'

type Source = { id: string; title: string; url: string; text: string; retrieved: string; retrieval_status: string }
type MemoryUsed = { id: string; text: string; confirmed_at: string }
type Encounter = { id: number; title: string }
type Message = {
  mode: SupportMode
  observations: Record<string, unknown>[]
  memories: MemoryUsed[]
  question: string
  answer: string
  status: string
  citations: Source[]
  created_at: string
}

const purposes = { followup: 'Follow-up', wellbeing: 'Wellbeing', education: 'Education' }
const outcomes: Record<string, string> = {
  grounded: 'NASA evidence selected',
  abstained: 'No evidence answer',
  unavailable: 'Model unavailable or busy',
  timeout: 'Model timed out',
  invalid_response: 'Evidence validation failed',
  context_changed: 'Consultation context changed',
}

async function request<T>(path: string, { body, signal }: { body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const response = await authenticatedFetch('/api' + path, {
    signal,
    ...(body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(typeof error?.detail === 'string' ? error.detail : `Request failed (${response.status}). Try again.`)
  }
  return response.json()
}

export const modes = [
  ['doctor', 'Doctor support', supportModes.doctor.description],
  ['nurse', 'Nurse support', supportModes.nurse.description],
  ['pharmacist', 'Pharmacist support', supportModes.pharmacist.description],
  ['psychologist', 'Psychologist support', supportModes.psychologist.description],
] as const

export default function Companion({
  crewId,
  crewName = 'Astronaut',
  missionName,
  mode: initialMode,
  onModeChange,
}: {
  crewId: number
  crewName?: string
  missionName?: string
  mode?: SupportMode
  onModeChange?: (mode: SupportMode) => void
}) {
  const [mode, setMode] = useState<SupportMode>(initialMode ?? 'doctor')
  useEffect(() => {
    if (initialMode && initialMode !== mode) {
      setMode(initialMode)
    }
  }, [initialMode])
  const [purpose, setPurpose] = useState<keyof typeof purposes>('followup')
  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [encounter, setEncounter] = useState(0)
  const [question, setQuestion] = useState('')
  const [ready, setReady] = useState<boolean | null>(null)
  const [pending, setPending] = useState<{ scope: string; mode: SupportMode } | null>(null)
  const [creating, setCreating] = useState(false)
  const [encounterError, setEncounterError] = useState('')
  const [history, setHistory] = useState<{ scope: string; messages: Message[] }>({ scope: '', messages: [] })
  const [feedback, setFeedback] = useState<{ scope: string; error: string } | null>(null)
  const [revision, setRevision] = useState(0)
  const [showLobby, setShowLobby] = useState(false)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [historyFailure, setHistoryFailure] = useState<{ scope: string; error: string } | null>(null)
  const [overviewVersion, setOverviewVersion] = useState(0)
  const scope = `${crewId}:${encounter}:${purpose}:${mode}:${revision}`
  const path = `/crew/${crewId}/encounters/${encounter}`
  const currentScope = useRef(scope)
  const transcript = useRef<HTMLDivElement>(null)
  currentScope.current = scope

  useEffect(() => {
    const controller = new AbortController()
    request<{ encounters: Encounter[] }>(`/crew/${crewId}/overview`, { signal: controller.signal })
      .then(data => {
        setEncounters(data.encounters)
        setEncounter(data.encounters.at(-1)?.id ?? 0)
        setEncounterError('')
      })
      .catch(error => { if (!controller.signal.aborted) setEncounterError(error.message) })
    return () => controller.abort()
  }, [crewId, overviewVersion])

  useEffect(() => {
    if (!encounter) return
    const controller = new AbortController()
    request<Message[]>(`${path}/conversation?purpose=${purpose}&mode=${mode}`, { signal: controller.signal })
      .then(messages => {
        if (!controller.signal.aborted) {
          setHistory({ scope, messages })
          setHistoryFailure(null)
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) setHistoryFailure({ scope, error: error.message })
      })
    return () => controller.abort()
  }, [encounter, mode, path, purpose, scope, historyVersion])

  useEffect(() => {
    const controller = new AbortController()
    let timer: number
    async function refresh() {
      try {
        const status = await request<{ ready: boolean }>('/ai/status', { signal: controller.signal })
        if (!controller.signal.aborted) setReady(status.ready)
      } catch {
        if (!controller.signal.aborted) setReady(false)
      }
      if (!controller.signal.aborted) timer = window.setTimeout(refresh, 15000)
    }
    void refresh()
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [])

  function changeScope() {
    setQuestion('')
    setFeedback(null)
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !encounter || !question.trim()) return
    setPending({ scope, mode })
    setFeedback(null)
    try {
      await request<Message>(`${path}/chat`, { body: { question, purpose, mode } })
      if (currentScope.current === scope) setQuestion('')
      setHistoryVersion(version => version + 1)
    } catch (error) {
      setFeedback({ scope, error: error instanceof Error ? error.message : 'Consultation failed. Try again.' })
    } finally {
      setPending(null)
    }
  }

  async function newEncounter() {
    setCreating(true)
    setEncounterError('')
    try {
      const next = await request<Encounter>(`/crew/${crewId}/encounters`, {
        body: { title: 'Medical companion research discussion', notes: 'Synthetic educational conversation; not clinical care.' },
      })
      setEncounters(items => [...items, next])
      setEncounter(next.id)
      changeScope()
    } catch (error) {
      setEncounterError(error instanceof Error ? error.message : 'Could not create the encounter.')
    } finally {
      setCreating(false)
    }
  }

  const messages = history.scope === scope ? history.messages : []
  const lastReply = messages.at(-1)?.created_at
  useEffect(() => {
    if (lastReply && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight
  }, [lastReply])
  const processing = pending?.scope === scope
  const recordOnly = mode === 'pharmacist'
  const modelLabel = publicDemo ? 'Deterministic educational demo · no live AI' : ready === null ? 'Checking model availability' : ready ? 'Model ready' : 'Model unavailable'

  return <section className="medical-chat companion-workspace" aria-labelledby="companion-title">
    <header className="companion-header">
      <div>
        <p className="companion-mission">{missionName?.startsWith('LUNA-01') ? 'LUNA-01' : missionName ?? 'Mission'} / {crewName}</p>
        <h1 id="companion-title">Medical Companion</h1>
        <p>{publicDemo ? 'Explore reviewed NASA excerpts and fictional crew observations. Inputs stay in this tab. Do not enter real medical information.' : 'Explore NASA references and review fictional crew observations. The VIGIL service runs the model.'}</p>
      </div>
      <div className="companion-header-actions">
        <button
          type="button"
          className="text-button lobby-trigger-btn"
          onClick={() => setShowLobby(true)}
          title="Open interactive 3D specialist pedestals"
        >
          <Sparkles size={14} /> 3D Specialist Lobby
        </button>
        <div className="companion-model" data-availability={ready === true ? 'ready' : 'waiting'} role="status"><Radio size={16} />{modelLabel}</div>
      </div>
    </header>
    <p className="companion-scope"><ShieldCheck size={19} /><span><strong>Simulated AI support · synthetic crew only</strong> · Educational research demonstration. The modes cannot diagnose, prescribe or give treatment instructions. Clinical safety review is pending.</span></p>
    <div className="companion-layout">
      <aside className="companion-rail">
        <fieldset className="support-modes">
          <legend>Choose a support mode</legend>
          {(Object.keys(supportModes) as SupportMode[]).map(id => <button
            type="button" key={id} aria-pressed={mode === id}
            onClick={() => { if (mode !== id) { changeScope(); setMode(id) } }}
          >
            <SupportPortrait mode={id} active={mode === id} />
            <div><strong>{supportModes[id].label}</strong><span>Simulated AI</span></div>
          </button>)}
        </fieldset>
        <div className="companion-card companion-settings">
          <h2>Consultation settings</h2>
          <label>Purpose
            <select aria-label="Companion purpose" value={purpose} onChange={event => {
              changeScope()
              setPurpose(event.target.value as keyof typeof purposes)
            }}>
              {Object.entries(purposes).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
            </select>
          </label>
          <label>Encounter
            <select aria-label="Conversation encounter" disabled={creating} value={encounter}
              onChange={event => { changeScope(); setEncounter(Number(event.target.value)) }}>
              {!encounter && <option value={0}>Create an encounter to begin</option>}
              {encounters.map(item => <option key={item.id} value={item.id}>{item.title} · #{item.id}</option>)}
            </select>
          </label>
          <button type="button" className="text-button" disabled={creating} onClick={newEncounter}><Plus size={15} />{creating ? 'Creating encounter…' : 'New research encounter'}</button>
          {encounterError && <p role="alert" className="error">{encounterError} <button type="button" className="text-button" onClick={() => setOverviewVersion(version => version + 1)}>Reload encounters</button></p>}
        </div>
      </aside>

      <div className="companion-content">
        <div className="companion-card companion-conversation">
          <div className="companion-current">
            <InteractiveAvatar3D mode={mode} isProcessing={processing} />
            <div>
              <h2>{supportModes[mode].label}</h2>
              <p>{supportModes[mode].description}</p>
            </div>
          </div>
          <div className="messages" ref={transcript} role="log" aria-label="Consultation transcript" tabIndex={0}>
            {historyFailure?.scope === scope && <p role="alert" className="error">{historyFailure.error} <button className="text-button" onClick={() => setHistoryVersion(version => version + 1)}>Reload conversation</button></p>}
            {!messages.length && historyFailure?.scope !== scope && <p className="companion-empty">{recordOnly
              ? 'Record a fictional medication question here.'
              : 'For example, ask how spaceflight affects sleep.'}</p>}
            {messages.map((message, index) => <Reply message={message} key={`${message.created_at}-${index}`} />)}
          </div>
          <p className="companion-progress" role="status" data-processing={processing}>
            {processing ? (recordOnly ? 'Recording your question…' : 'Checking reviewed evidence. This can take a minute or more…')
              : pending ? `${supportModes[pending.mode].label} has a consultation in progress.`
              : !publicDemo && ready === false && !recordOnly ? 'Reference search and monitoring are available during a model outage.' : ''}
          </p>
          {feedback?.scope === scope && <p role="alert" className="error">{feedback.error}</p>}
          <form noValidate onSubmit={send} className="companion-composer">
            <label>Question<textarea className="resize-none" aria-label="Medical question" value={question}
              onChange={event => setQuestion(event.target.value)} required maxLength={1200}
              disabled={processing} rows={3} /></label>
            <button className="primary" disabled={!!pending || !encounter || !question.trim()}>
              {recordOnly ? 'Record question' : 'Ask Medical Companion'}
            </button>
          </form>
        </div>
        <div className="companion-card companion-resources">
          {!publicDemo && <MemoryPanel key={`${crewId}:${purpose}:${mode}`} crew={crewId} purpose={purpose} mode={mode}
            onChanged={() => setRevision(version => version + 1)} />}
          <Search />
        </div>
      </div>
    </div>
    {showLobby && (
      <Suspense fallback={<div className="empty">Loading 3D specialist lobby…</div>}>
        <CompanionView crewId={crewId} onClose={() => setShowLobby(false)} />
      </Suspense>
    )}
  </section>
}

function Reply({ message }: { message: Message }) {
  return <article className="companion-reply">
    <h3>You</h3><p>{message.question}</p>
    <h3>{supportModes[message.mode].label} · Simulated AI</h3>
    <p className="reply-outcome">{message.mode === 'pharmacist' ? 'Question recorded' : outcomes[message.status] ?? message.status}</p>
    <p className="answer-text">{message.answer}</p>
    {message.observations.map((row, index) => <div className="memory-used" key={index}>
      <strong>Recorded synthetic measurement · #{String(row.id)}</strong>
      {Object.entries(row).filter(([key]) => key !== 'id').map(([key, value]) =>
        <p key={key}>{key.replaceAll('_', ' ')}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>)}
      <small>Personal baseline differences are arithmetic comparisons, not clinical thresholds.</small>
    </div>)}
    {message.memories.map(memory => <div className="memory-used" key={memory.id}>
      <strong>Explicitly confirmed user report</strong><p>{memory.text}</p>
      <small>Memory {memory.id} · confirmed {memory.confirmed_at}. You can correct or revoke it in Memory.</small>
    </div>)}
    {message.citations.map(source => <details key={source.id}>
      <summary>{source.title} · {source.id}{source.retrieval_status !== 'active' && ' · Historical citation'}</summary>
      <blockquote>{source.text}</blockquote>
      <a href={source.url} target="_blank" rel="noreferrer">NASA original</a><small> · Retrieved {source.retrieved}</small>
    </details>)}
  </article>
}

function Search() {
  const [query, setQuery] = useState('')
  const [sources, setSources] = useState<Source[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const requestController = useRef<AbortController | null>(null)
  useEffect(() => () => requestController.current?.abort(), [])

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestController.current || !query.trim()) return
    const controller = new AbortController()
    requestController.current = controller
    setError('')
    setSources(null)
    setBusy(true)
    try {
      const matches = await request<Source[]>('/documents/search?q=' + encodeURIComponent(query.trim()), { signal: controller.signal })
      if (!controller.signal.aborted) setSources(matches)
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Reference search failed.')
    } finally {
      if (requestController.current === controller) {
        requestController.current = null
        setBusy(false)
      }
    }
  }
  return <details className="source-search">
    <summary><BookOpen size={15} /> Search reviewed references</summary>
    <form noValidate onSubmit={search} onKeyDown={event => {
      if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault()
    }}>
      <input ref={input} aria-label="Reference search" required maxLength={1200} value={query} onChange={event => setQuery(event.target.value)} />
      {query && <button type="button" className="text-button" onClick={() => {
        requestController.current?.abort()
        requestController.current = null
        setBusy(false)
        setQuery('')
        setSources(null)
        setError('')
        input.current?.focus()
      }}>Clear reference search</button>}
      <button className="secondary" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search'}</button>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
    {sources?.length === 0 && <p role="status">No matching reviewed references.</p>}
    {sources?.map(source => <article key={source.id}><strong>{source.title}</strong><p>{source.text}</p><small>{source.id}</small></article>)}
  </details>
}
