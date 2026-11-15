import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, LoaderCircle, X } from 'lucide-react'
import { api, getEditor, parseField, RequestError, type Crew, type DialogName, type Mission, type Overview } from './data'

type Props = {
  name: DialogName
  mission: Mission | null
  overview: Overview | null
  onDismiss: () => void
  onSaved: (message: string, member?: Crew) => void
}

export function RecordDialog({ name, mission, overview, onDismiss, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  const requestError = useRef<HTMLParagraphElement>(null)
  const invalidControl = useRef<HTMLElement | null>(null)
  const priorFocus = useRef<HTMLElement | null>(null)
  const saving = useRef(false)
  const composing = useRef(false)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const definition = name === 'about' ? null : getEditor(name, mission, overview)
  const title = definition?.title ?? 'About VIGIL'

  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    const initial = element.querySelector<HTMLElement>('input, select, textarea, .dialog-done')
    initial?.focus()
    return () => element.close()
  }, [])

  useEffect(() => {
    if (!dirty && !busy) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty, busy])

  useEffect(() => {
    if (discard) keep.current?.focus()
    else if (priorFocus.current) {
      priorFocus.current.focus()
      priorFocus.current = null
    }
  }, [discard])

  useEffect(() => {
    if (busy) return
    if (invalidControl.current) {
      invalidControl.current.focus()
      invalidControl.current = null
    } else if (error) requestError.current?.focus()
  }, [busy, error, fieldErrors])

  function close() {
    dialog.current?.close()
    onDismiss()
  }

  function requestClose() {
    if (saving.current) return
    if (discard) setDiscard(false)
    else if (dirty) {
      priorFocus.current = document.activeElement as HTMLElement
      setDiscard(true)
    } else close()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!definition || saving.current || composing.current || uncertain) return
    const form = event.currentTarget
    const errors: Record<string, string> = {}
    const values: Record<string, unknown> = {}
    for (const field of definition.fields) {
      const control = form.elements.namedItem(field.name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      const result = parseField(field, control)
      if (result.error) errors[field.name] = result.error
      else values[field.name] = result.value
    }
    if (name === 'mission' && typeof values.name === 'string' &&
        values.name.startsWith('LUNA-01') !== Boolean(mission?.name.startsWith('LUNA-01'))) {
      errors.name = 'Keep the existing scenario identifier. Use a fresh LUNA-01 database for the lunar scenario.'
    }
    function showFields(invalid: Record<string, string>) {
      const first = form.elements.namedItem(Object.keys(invalid)[0])
      invalidControl.current = first instanceof HTMLElement ? first : null
      setFieldErrors(invalid)
    }
    setError('')
    if (Object.keys(errors).length) {
      showFields(errors)
      return
    }
    setFieldErrors({})
    if (name === 'checkin' && !values.symptoms) values.symptoms = 'None reported'
    saving.current = true
    setBusy(true)
    try {
      const result = await api<Crew>(definition.path, definition.method, values)
      dialog.current?.close()
      onSaved(definition.confirmation, name === 'newcrew' ? result : undefined)
    } catch (cause) {
      const rejected = cause instanceof RequestError && cause.status >= 400 && cause.status < 500 && cause.status !== 408
      if (rejected) {
        if (Object.keys(cause.fields).length) showFields(cause.fields)
        else setError(cause.status === 403
          ? `${cause.message} Your entries are still here. Ask the workspace operator to check your access.`
          : `${cause.message} Your entries are still here. Try saving again.`)
      } else {
        setUncertain(true)
        setError('The VIGIL service did not confirm this save. Close the form and refresh the workspace to check the record before submitting again.')
      }
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return <dialog ref={dialog} className="modal" aria-labelledby={discard ? 'discard-title' : 'dialog-title'}
    aria-describedby={discard ? 'discard-description' : 'dialog-description'}
    onCancel={event => { event.preventDefault(); requestClose() }}>
    <div hidden={discard}>
      <header className="dialog-header">
        <div><p className="label accent">Synthetic data only</p><h2 id="dialog-title">{title}</h2></div>
        <button className="icon-button" type="button" aria-label="Close dialog" title="Close dialog" disabled={busy} onClick={requestClose}><X size={19} /></button>
      </header>
      <p className="dialog-description" id="dialog-description">
        {definition?.description ?? (name === 'about'
          ? 'VIGIL is a demonstration of astronaut health monitoring. All records are synthetic. The VIGIL service stores records and runs the Medical Companion model. The companion selects reviewed reference excerpts for research. Clinical safety review is pending. It cannot diagnose, prescribe or give treatment instructions.'
          : 'Use fictional information only.')}
      </p>
      {definition ? <form noValidate onSubmit={submit}
        onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
        onKeyDown={event => { if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing)) event.preventDefault() }}
        onChange={event => {
          setDirty(true)
          const control = event.target
          if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
            setFieldErrors(current => current[control.name] ? { ...current, [control.name]: '' } : current)
          }
        }}>
        <fieldset className="form-grid" disabled={busy || uncertain}>
          {definition.fields.map(field => {
            const id = `record-${field.name}`
            const message = fieldErrors[field.name]
            const props = {
              id, name: field.name, defaultValue: field.value,
              'aria-invalid': message ? true : undefined,
              'aria-describedby': message ? id + '-error' : undefined,
              required: field.required,
            }
            return <div className={field.type === 'textarea' ? 'field field-wide' : 'field'} key={field.name}>
              <label htmlFor={id}>{field.label}</label>
              {field.options ? <select {...props}>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                : field.type === 'textarea' ? <textarea {...props} className="resize-none" maxLength={field.maxLength} />
                  : <input {...props} type={field.type ?? 'text'} min={field.min} max={field.max}
                    step={field.type === 'number' ? field.integer ? 1 : 'any' : undefined}
                    maxLength={field.maxLength} placeholder={field.placeholder} />}
              <span className="field-error" id={id + '-error'}>{message}</span>
            </div>
          })}
        </fieldset>
        {error && <p className="error-box" role="alert" ref={requestError} tabIndex={-1}>{error}</p>}
        <div className="form-footer">
          <span className="muted">Stored by VIGIL</span>
          <button className="secondary" type="button" disabled={busy} onClick={requestClose}>{uncertain ? 'Close' : 'Cancel'}</button>
          <button className="primary" type="submit" aria-busy={busy} aria-disabled={busy || undefined} disabled={uncertain}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{definition.action}
          </button>
          <span role="status" className="sr-only">{busy ? 'Saving' : ''}</span>
        </div>
      </form> : <div className="form-footer"><button className="primary dialog-done" type="button" onClick={close}>Close</button></div>}
    </div>
    {discard && <div>
      <h2 id="discard-title">Discard your changes?</h2>
      <p id="discard-description" className="dialog-description">Your entries will be lost if you close this form.</p>
      <div className="form-footer">
        <button type="button" className="secondary" ref={keep} onClick={() => setDiscard(false)}>Keep editing</button>
        <button type="button" className="danger" onClick={close}>Discard changes</button>
      </div>
    </div>}
  </dialog>
}
