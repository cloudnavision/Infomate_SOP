import type { SOPListItem, SOPDetail, SOPStep, TranscriptLine, SOPSection, WatchlistItem } from './types'
import { supabase } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function fetchAPI<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  // ── DEBUG ────────────────────────────────────────────────
  console.log('[AUTH DEBUG] fetchAPI', path,
    '| session found:', !!session,
    '| token prefix:', session?.access_token?.slice(0, 20) ?? 'NONE',
    '| auth header set:', !!session?.access_token,
  )
  // ────────────────────────────────────────────────────────
  const headers: HeadersInit = {}
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  const res = await fetch(`${API_BASE}${path}`, { headers })
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export const fetchSOPs = () => fetchAPI<SOPListItem[]>('/api/sops')
export const fetchSOP = (id: string) => fetchAPI<SOPDetail>(`/api/sops/${id}`)
export const fetchSteps = (id: string) => fetchAPI<SOPStep[]>(`/api/sops/${id}/steps`)
export const fetchTranscript = (id: string, speaker?: string) => {
  const params = speaker ? `?speaker=${encodeURIComponent(speaker)}` : ''
  return fetchAPI<TranscriptLine[]>(`/api/sops/${id}/transcript${params}`)
}
export const fetchSections = (id: string) => fetchAPI<SOPSection[]>(`/api/sops/${id}/sections`)
export const fetchWatchlist = (id: string) => fetchAPI<WatchlistItem[]>(`/api/sops/${id}/watchlist`)

export const sopKeys = {
  all: ['sops'] as const,
  detail: (id: string) => ['sops', id] as const,
  steps: (id: string) => ['sops', id, 'steps'] as const,
  transcript: (id: string) => ['sops', id, 'transcript'] as const,
  sections: (id: string) => ['sops', id, 'sections'] as const,
  watchlist: (id: string) => ['sops', id, 'watchlist'] as const,
}
