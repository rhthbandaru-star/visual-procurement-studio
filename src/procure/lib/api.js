const API_URL = import.meta.env.VITE_BUTTERBASE_API_URL
const ANON_KEY = import.meta.env.VITE_BUTTERBASE_ANON_KEY ?? 'anon'

export async function apiFetch(path) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'x-api-key': ANON_KEY },
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json()
}

export const fmt$ = (n) =>
  n != null ? '$' + Number(n).toLocaleString() : '—'

export const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—'

export const fmtShortDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—'
