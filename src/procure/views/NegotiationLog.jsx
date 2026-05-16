import { useState, useEffect, useRef } from 'react'
import { apiFetch, fmtShortDate } from '../lib/api'
import { Loading, ErrorBox } from '../components/ui'

const TIMELINE = [
  { color: '#639922', date: 'May 14, 2026', text: 'Vendor confirmed 18-day lead time; counter-proposal sent' },
  { color: '#378ADD', date: 'May 12, 2026', text: 'Finance approved budget up to $220K' },
  { color: '#378ADD', date: 'May 10, 2026', text: 'Delivery timeline raised; storage discount under review' },
  { color: '#BA7517', date: 'May 9, 2026',  text: 'NovaTech proposed 5% storage discount with 3-yr support' },
  { color: '#888780', date: 'May 8, 2026',  text: 'Quote received — $212,500. Negotiation opened.' },
]

function StreamingMessage({ message, onDone }) {
  const [displayed, setDisplayed] = useState('')
  const idxRef = useRef(0)

  useEffect(() => {
    idxRef.current = 0
    setDisplayed('')
    const timer = setInterval(() => {
      if (idxRef.current < message.length) {
        setDisplayed(message.slice(0, ++idxRef.current))
      } else {
        clearInterval(timer)
        onDone?.()
      }
    }, 20)
    return () => clearInterval(timer)
  }, [message])

  const done = displayed.length >= message.length

  return (
    <span>
      {displayed}
      {!done && <span className="cursor" aria-hidden="true" />}
    </span>
  )
}

export default function NegotiationLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const bodyRef = useRef(null)

  useEffect(() => {
    apiFetch('/negotiation_logs?order=created_at.asc')
      .then(setLogs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [logs])

  if (loading) return <Loading text="Loading negotiation log…" />
  if (error)   return <ErrorBox message={error} />

  const pastMsgs = logs.slice(0, -1)
  const lastMsg  = logs[logs.length - 1]

  return (
    <div className="neg-grid">
      {/* Conversation panel */}
      <div className="neg-panel">
        <div className="neg-head">
          <span>Conversation log</span>
          <span className="badge badge-blue">NovaTech Ltd.</span>
        </div>
        <div className="neg-body" ref={bodyRef}>
          {pastMsgs.map((m) => (
            <div key={m.id} className={`msg ${m.author_type === 'vendor' ? 'vendor' : ''}`}>
              <div className="msg-meta">
                {m.author} · {fmtShortDate(m.created_at)}
              </div>
              {m.message}
            </div>
          ))}

          {lastMsg && (
            <div className="msg vendor">
              <div className="msg-meta">
                {lastMsg.author} · {fmtShortDate(lastMsg.created_at)}
                <span className="live-indicator">
                  <i className="ti ti-circle-filled" aria-hidden="true" />
                  Live
                </span>
              </div>
              <StreamingMessage
                message={lastMsg.message}
                onDone={() => {
                  if (bodyRef.current)
                    bodyRef.current.scrollTop = bodyRef.current.scrollHeight
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Timeline panel */}
      <div className="neg-panel">
        <div className="neg-head">Activity timeline</div>
        <div className="neg-body">
          {TIMELINE.map((item, i) => (
            <div key={i} className="tl-item">
              <div className="tl-dot" style={{ background: item.color }} />
              <div>
                <div className="tl-date">{item.date}</div>
                <div className="tl-text">{item.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
