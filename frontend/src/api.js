// Thin client for Open WebUI's OpenAI-compatible API.
// Requests go to /api/* and are proxied by Vite (see vite.config.js).

async function errorMessage(res) {
  const text = await res.text().catch(() => '')
  try {
    const json = JSON.parse(text)
    return json.detail || json.error?.message || json.message || text
  } catch {
    return text || `${res.status} ${res.statusText}`
  }
}

export async function getModels() {
  const res = await fetch('/api/models')
  if (!res.ok) throw new Error(`Could not load models: ${await errorMessage(res)}`)
  const json = await res.json()
  return (json.data || []).map((m) => m.id)
}

// Streams the assistant reply, calling onToken for each text chunk.
export async function streamChat(model, messages, onToken, signal) {
  const res = await fetch('/api/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  })
  if (!res.ok) throw new Error(await errorMessage(res))

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        if (json.error) throw new Error(json.error.message || 'Model error')
        const token = json.choices?.[0]?.delta?.content
        if (token) onToken(token)
      } catch (err) {
        if (err instanceof SyntaxError) continue
        throw err
      }
    }
  }
}
