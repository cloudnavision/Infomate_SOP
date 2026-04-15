import type { SOPListItem, SOPDetail, SOPStep, TranscriptLine, SOPSection, WatchlistItem, AppUser, UserCreateInput, UserUpdateInput, CalloutPatchItem, StepCallout, SOPMetrics, LikeResponse } from './types'
import { supabase } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: HeadersInit = {}
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  return headers
}

export async function fetchAPI<T>(path: string): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}${path}`, { headers })
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

async function mutateAPI<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T | null> {
  const headers = await getAuthHeaders()
  if (body !== undefined) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`)
  }
  if (res.status === 204) return null
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

export interface ExportResponse {
  download_url: string
  filename: string
  format: string
}

export async function exportSOP(id: string, format: 'docx' | 'pdf'): Promise<ExportResponse> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/api/sops/${id}/export?format=${format}`, {
    method: 'POST',
    headers,
  })
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<ExportResponse>
}

export interface RenderAnnotatedResponse {
  annotated_screenshot_url: string
}

export async function patchCallouts(
  stepId: string,
  items: CalloutPatchItem[],
): Promise<StepCallout[]> {
  const result = await mutateAPI<StepCallout[]>(`/api/steps/${stepId}/callouts`, 'PATCH', items)
  if (result === null) throw new Error('Unexpected empty response from PATCH callouts')
  return result
}

export async function renderAnnotated(stepId: string): Promise<RenderAnnotatedResponse> {
  const result = await mutateAPI<RenderAnnotatedResponse>(
    `/api/steps/${stepId}/render-annotated`, 'POST'
  )
  if (result === null) throw new Error('Unexpected empty response from POST render-annotated')
  return result
}

export const approveStep = (stepId: string) => mutateAPI<SOPStep>(`/api/steps/${stepId}/approve`, 'PATCH')
export const fetchMetrics = (id: string) => fetchAPI<SOPMetrics>(`/api/sops/${id}/metrics`)
export const trackView = (id: string) => mutateAPI<null>(`/api/sops/${id}/view`, 'POST')
export const toggleLike = (id: string) => mutateAPI<LikeResponse>(`/api/sops/${id}/like`, 'POST')
export const deleteSOP = (id: string) => mutateAPI<null>(`/api/sops/${id}`, 'DELETE')

// ── User management (admin only) ──────────────────────────────────────────────
export const fetchUsers = () => fetchAPI<AppUser[]>('/api/users')
export const createUser = (data: UserCreateInput) => mutateAPI<AppUser>('/api/users', 'POST', data)
export const updateUser = (id: string, data: UserUpdateInput) => mutateAPI<AppUser>(`/api/users/${id}`, 'PATCH', data)
export const deleteUser = (id: string) => mutateAPI<null>(`/api/users/${id}`, 'DELETE')

export const userKeys = {
  all: ['users'] as const,
  detail: (id: string) => ['users', id] as const,
}

export const sopKeys = {
  all: ['sops'] as const,
  detail: (id: string) => ['sops', id] as const,
  steps: (id: string) => ['sops', id, 'steps'] as const,
  transcript: (id: string) => ['sops', id, 'transcript'] as const,
  sections: (id: string) => ['sops', id, 'sections'] as const,
  watchlist: (id: string) => ['sops', id, 'watchlist'] as const,
  metrics: (id: string) => ['sops', id, 'metrics'] as const,
}
