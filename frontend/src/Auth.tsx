import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Orbit } from 'lucide-react'
import { AuthShowcase } from './ui'
import { peekHandlers } from './peek'

const PeekingStaff = lazy(() => import('./PeekingStaff'))

let csrf = ''

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (import.meta.env.MODE === 'space-apps') {
    const { demoFetch } = await import('./public-demo')
    return demoFetch(input, init)
  }
  const headers = new Headers(init.headers)
  if (init.method && !['GET', 'HEAD', 'OPTIONS'].includes(init.method.toUpperCase())) {
    headers.set('X-CSRF-Token', csrf)
  }
  const response = await fetch(input, { ...init, headers, credentials: 'same-origin', cache: 'no-store' })
  if (response.status === 401) {
    csrf = ''
    window.dispatchEvent(new Event('vigil-session-expired'))
  }
  return response
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const expired = () => {
      setUser('')
      setError('Session expired. Sign in again.')
      csrf = ''
    }
    window.addEventListener('vigil-session-expired', expired)
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async r => {
        if (r.ok) {
          const d = await r.json()
          csrf = d.csrf_token
          setUser(d.username)
        }
      })
      .catch(() => setError('Could not check the session. You can retry by signing in.'))
      .finally(() => setReady(true))
    return () => window.removeEventListener('vigil-session-expired', expired)
  }, [])

  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const missing = Array.from(e.currentTarget.querySelectorAll('input')).find(input => !input.value.trim())
    if (missing) {
      setError('Enter your username and password.')
      missing.focus()
      return
    }
    setBusy(true)
    setError('')
    const f = new FormData(e.currentTarget)
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: f.get('username'), password: f.get('password') }),
      })
      if (!r.ok) {
        const detail = await r.json().catch(() => null)
        throw new Error(
          r.status === 401
            ? 'Sign-in failed. Check credentials.'
            : typeof detail?.detail === 'string'
              ? detail.detail
              : 'Sign-in service unavailable. Try again.'
        )
      }
      const d = await r.json()
      csrf = d.csrf_token
      setUser(d.username)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return <div className="empty">Checking session…</div>

  if (!user) {
    return (
      <div className="auth-screen">
        <aside className="auth-showcase">
          <AuthShowcase />
        </aside>
        <main
          className="auth-panel"
          onMouseEnter={peekHandlers.enter}
          onMouseMove={peekHandlers.move}
          onFocus={peekHandlers.focusIn}
        >
          <Suspense fallback={null}>
            <PeekingStaff />
          </Suspense>
          <section className="auth-card modal">
            <div className="auth-brand" aria-hidden="true">
              <span className="brand-symbol"><Orbit size={18} /></span>
              <span>VIGIL</span>
            </div>
            <p className="eyebrow">VIGIL · SYNTHETIC DEMO</p>
            <h2>Sign in to your workspace</h2>
            <p className="muted">
              Access is limited to explicitly granted crew records. Only explicitly confirmed, purpose-permitted memory may enter the model’s context.
            </p>
            <form noValidate onSubmit={login}>
              <label>
                Username
                <input name="username" autoComplete="username" required maxLength={80} />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={256}
                  onFocus={peekHandlers.eyesClose}
                  onBlur={peekHandlers.eyesOpen}
                />
              </label>
              {error && <p role="alert" className="error">{error}</p>}
              <button className="primary" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <p className="tiny muted">Accounts are provisioned by the workspace operator. No default passwords.</p>
          </section>
        </main>
      </div>
    )
  }

  return (
    <>
      <div className="session-badge">
        {error && <span role="alert">{error}</span>}
        <span>{user} · synthetic session</span>
        <button
          onClick={async () => {
            try {
              const r = await authenticatedFetch('/api/auth/logout', { method: 'POST' })
              if (!r.ok) throw new Error('Sign-out failed; session may still be active.')
              csrf = ''
              setUser('')
            } catch {
              setError('Sign-out failed; session may still be active.')
            }
          }}
        >
          Sign out
        </button>
      </div>
      {children}
    </>
  )
}
