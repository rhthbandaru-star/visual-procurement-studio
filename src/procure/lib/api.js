const API_URL = import.meta.env.VITE_BUTTERBASE_API_URL
const ANON_KEY = import.meta.env.VITE_BUTTERBASE_ANON_KEY ?? 'anon'

// --- Fixture data for mockups when the live API is unavailable ---
const FIXTURES = {
  vendors: [
    { id: 'v1', name: 'Axion Systems',  category: 'Cloud infrastructure', status: 'preferred', rating: '4.8' },
    { id: 'v2', name: 'NovaTech Ltd.',  category: 'Hardware & components', status: 'active',    rating: '4.5' },
    { id: 'v3', name: 'CoreRoute Inc.', category: 'Networking',           status: 'in_review',  rating: '4.1' },
    { id: 'v4', name: 'Proxima SaaS',   category: 'Software licensing',   status: 'preferred',  rating: '4.7' },
    { id: 'v5', name: 'Deltalink Co.',  category: 'Logistics & supply',   status: 'active',     rating: '4.2' },
    { id: 'v6', name: 'Helix Cloud',    category: 'Cloud infrastructure', status: 'in_review',  rating: '3.9' },
    { id: 'v7', name: 'Quantra Labs',   category: 'R&D services',         status: 'inactive',   rating: '3.6' },
    { id: 'v8', name: 'Beacon Print',   category: 'Print & fulfillment',  status: 'active',     rating: '4.0' },
  ],
  quotes: [
    { id: 'q1', vendor_id: 'v2', description: 'GPU cluster — 24 nodes',     submitted_at: '2026-05-08', amount: '212500', status: 'negotiating' },
    { id: 'q2', vendor_id: 'v1', description: 'Annual cloud commit',         submitted_at: '2026-05-05', amount: '184000', status: 'approved' },
    { id: 'q3', vendor_id: 'v4', description: 'SaaS seats — 350 users',      submitted_at: '2026-05-02', amount: '42500',  status: 'under_review' },
    { id: 'q4', vendor_id: 'v3', description: 'Edge router refresh',         submitted_at: '2026-04-28', amount: '67800',  status: 'draft' },
    { id: 'q5', vendor_id: 'v5', description: 'Q3 logistics retainer',       submitted_at: '2026-04-24', amount: '31200',  status: 'approved' },
  ],
  contracts: [
    { id: 'c1', title: 'Cloud MSA — Axion',     description: '3-year master services',   start_date: '2025-01-01', expiry_date: '2027-12-31', value: '540000', status: 'active' },
    { id: 'c2', title: 'GPU lease — NovaTech',  description: '24-node cluster',          start_date: '2026-06-01', expiry_date: '2029-05-31', value: '212500', status: 'negotiating' },
    { id: 'c3', title: 'SaaS license — Proxima',description: '350 seats, annual',         start_date: '2026-01-15', expiry_date: '2026-07-14', value: '42500',  status: 'active' },
    { id: 'c4', title: 'Logistics — Deltalink', description: 'Regional fulfillment',     start_date: '2025-09-01', expiry_date: '2026-08-31', value: '94800',  status: 'active' },
    { id: 'c5', title: 'Print SOW — Beacon',    description: 'Brand collateral run',     start_date: '2026-03-01', expiry_date: '2026-09-01', value: '18600',  status: 'draft' },
  ],
  negotiation_logs: [
    { id: 'n1', author: 'Sarah Lin (Procure)', author_type: 'user',   created_at: '2026-05-08T10:00:00Z', message: 'Initial quote received at $212,500. Opening negotiation on volume discount.' },
    { id: 'n2', author: 'NovaTech Ltd.',       author_type: 'vendor', created_at: '2026-05-09T14:20:00Z', message: 'We can offer a 5% storage discount paired with a 3-year support package.' },
    { id: 'n3', author: 'Sarah Lin (Procure)', author_type: 'user',   created_at: '2026-05-10T09:15:00Z', message: 'Need delivery timeline tightened to 14 days; reviewing storage terms internally.' },
    { id: 'n4', author: 'Mark Chen (Finance)', author_type: 'user',   created_at: '2026-05-12T16:00:00Z', message: 'Finance approved budget ceiling of $220K. Proceed with counter.' },
    { id: 'n5', author: 'NovaTech Ltd.',       author_type: 'vendor', created_at: '2026-05-14T11:42:00Z', message: 'Confirmed 18-day lead time. Sending revised proposal with 7% discount and extended SLA shortly.' },
  ],
}

function mockResponse(path) {
  const key = path.replace(/^\//, '').split('?')[0]
  return FIXTURES[key] ?? []
}

export async function apiFetch(path) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { 'x-api-key': ANON_KEY },
    })
    if (!res.ok) throw new Error(`API error ${res.status}`)
    return await res.json()
  } catch {
    return mockResponse(path)
  }
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
