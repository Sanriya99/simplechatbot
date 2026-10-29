import { useEffect, useRef, useState } from 'react'
import { getModels, streamChat } from './api.js'

export default function App() {
  const [models, setModels] = useState([])
  const [model, setModel] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    getModels()
      .then((ids) => {
        setModels(ids)
        const preferred = import.meta.env.VITE_DEFAULT_MODEL
        setModel(ids.includes(preferred) ? preferred : ids[0] || '')
        if (ids.length === 0) setError('No models available. Add a connection in Open WebUI.')
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || loading || !model) return

    const history = [...messages, { role: 'user', content: text }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setError('')
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat(
        model,
        history,
        (token) =>
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            next[next.length - 1] = { ...last, content: last.content + token }
            return next
          }),
        controller.signal
      )
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message)
        // Drop the empty assistant bubble if nothing arrived.
        setMessages((prev) =>
          prev[prev.length - 1]?.content === '' ? prev.slice(0, -1) : prev
        )
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  function newChat() {
    stop()
    setMessages([])
    setError('')
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Chatbot</h1>
        <div className="header-actions">
          {models.length > 1 && (
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          )}
          <button className="secondary" onClick={newChat}>New chat</button>
        </div>
      </header>

      <main className="messages">
        {messages.length === 0 && (
          <div className="empty">Ask me anything.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <div className="bubble">
              {m.content || (loading && i === messages.length - 1 ? <span className="thinking">Thinking…</span> : '')}
            </div>
          </div>
        ))}
        {error && <div className="error">{error}</div>}
        <div ref={bottomRef} />
      </main>

      <footer className="composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type your question…"
          rows={1}
        />
        {loading ? (
          <button onClick={stop}>Stop</button>
        ) : (
          <button onClick={send} disabled={!input.trim() || !model}>Send</button>
        )}
      </footer>
    </div>
  )
}
