import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { fetchSOP, sopKeys, setProjectCode } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import type { SOPSection } from '../api/types'

export const Route = createFileRoute('/sop/$id/overview')({
  component: OverviewPage,
})

// ── Section icons ─────────────────────────────────────────────────────────────
const SECTION_ICONS: Record<string, JSX.Element> = {
  purpose: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
    </svg>
  ),
  inputs: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd"/>
    </svg>
  ),
  process_summary: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
    </svg>
  ),
  outputs: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293 9.707a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L3.586 14H1a1 1 0 110-2h11.586l-1.293-1.293a1 1 0 011.414-1.414l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L12.414 16H1a1 1 0 110-2h2.586l-1.293-1.293z" clipRule="evenodd"/>
    </svg>
  ),
  risks: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
    </svg>
  ),
  training_prereqs: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
    </svg>
  ),
  software_access: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd"/>
    </svg>
  ),
  comm_matrix_infomate: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/>
    </svg>
  ),
  comm_matrix_client: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd"/>
    </svg>
  ),
  quality_params: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
    </svg>
  ),
  quality_sampling: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
    </svg>
  ),
  sow: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
    </svg>
  ),
  baseline_target: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd"/>
    </svg>
  ),
  challenges: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
    </svg>
  ),
  improvements: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/>
    </svg>
  ),
}

const SECTION_COLORS: Record<string, { bg: string; icon: string; border: string; badge: string }> = {
  purpose:              { bg: 'bg-blue-50',    icon: 'text-blue-500',   border: 'border-blue-100',   badge: 'bg-blue-100 text-blue-700' },
  inputs:               { bg: 'bg-emerald-50', icon: 'text-emerald-500',border: 'border-emerald-100',badge: 'bg-emerald-100 text-emerald-700' },
  process_summary:      { bg: 'bg-indigo-50',  icon: 'text-indigo-500', border: 'border-indigo-100', badge: 'bg-indigo-100 text-indigo-700' },
  outputs:              { bg: 'bg-teal-50',    icon: 'text-teal-500',   border: 'border-teal-100',   badge: 'bg-teal-100 text-teal-700' },
  risks:                { bg: 'bg-red-50',     icon: 'text-red-500',    border: 'border-red-100',    badge: 'bg-red-100 text-red-700' },
  training_prereqs:     { bg: 'bg-amber-50',   icon: 'text-amber-500',  border: 'border-amber-100',  badge: 'bg-amber-100 text-amber-700' },
  software_access:      { bg: 'bg-violet-50',  icon: 'text-violet-500', border: 'border-violet-100', badge: 'bg-violet-100 text-violet-700' },
  comm_matrix_infomate: { bg: 'bg-cyan-50',    icon: 'text-cyan-500',   border: 'border-cyan-100',   badge: 'bg-cyan-100 text-cyan-700' },
  comm_matrix_client:   { bg: 'bg-sky-50',     icon: 'text-sky-500',    border: 'border-sky-100',    badge: 'bg-sky-100 text-sky-700' },
  quality_params:       { bg: 'bg-purple-50',  icon: 'text-purple-500', border: 'border-purple-100', badge: 'bg-purple-100 text-purple-700' },
  quality_sampling:     { bg: 'bg-fuchsia-50', icon: 'text-fuchsia-500',border: 'border-fuchsia-100',badge: 'bg-fuchsia-100 text-fuchsia-700' },
  sow:                  { bg: 'bg-orange-50',  icon: 'text-orange-500', border: 'border-orange-100', badge: 'bg-orange-100 text-orange-700' },
  baseline_target:      { bg: 'bg-lime-50',    icon: 'text-lime-600',   border: 'border-lime-100',   badge: 'bg-lime-100 text-lime-700' },
  challenges:           { bg: 'bg-rose-50',    icon: 'text-rose-500',   border: 'border-rose-100',   badge: 'bg-rose-100 text-rose-700' },
  improvements:         { bg: 'bg-green-50',   icon: 'text-green-500',  border: 'border-green-100',  badge: 'bg-green-100 text-green-700' },
}

const DEFAULT_COLOR = { bg: 'bg-gray-50', icon: 'text-gray-400', border: 'border-gray-100', badge: 'bg-gray-100 text-gray-600' }

function impactBadge(val: string) {
  const v = val.toLowerCase()
  if (v === 'high')   return 'bg-red-100 text-red-700 border border-red-200'
  if (v === 'medium') return 'bg-amber-100 text-amber-700 border border-amber-200'
  if (v === 'low')    return 'bg-green-100 text-green-700 border border-green-200'
  return 'bg-gray-100 text-gray-600'
}

function StyledTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return null
  const cols = Object.keys(rows[0])
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {cols.map((col) => (
              <th key={col} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {col.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50 transition-colors">
              {cols.map((col) => {
                const val = String(row[col] ?? '')
                const isImpact = col.toLowerCase() === 'impact'
                const isFreq = col.toLowerCase() === 'frequency'
                const isAccess = col.toLowerCase() === 'access_level'
                const isOwner = col.toLowerCase() === 'owner'
                return (
                  <td key={col} className="px-4 py-3 text-gray-700 align-top">
                    {isImpact ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${impactBadge(val)}`}>
                        {val}
                      </span>
                    ) : (isFreq || isAccess || isOwner) ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        {val}
                      </span>
                    ) : val}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SectionCard({ section }: { section: SOPSection }) {
  const [open, setOpen] = useState(true)
  const colors = SECTION_COLORS[section.section_key] ?? DEFAULT_COLOR
  const icon = SECTION_ICONS[section.section_key]

  return (
    <div id={`section-${section.section_key}`} className={`rounded-xl border ${colors.border} overflow-hidden shadow-sm`}>
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-5 py-3.5 ${colors.bg} hover:brightness-95 transition-all`}
      >
        <div className="flex items-center gap-2.5">
          <span className={colors.icon}>{icon}</span>
          <span className="text-sm font-semibold text-gray-800">{section.section_title}</span>
        </div>
        <svg
          viewBox="0 0 20 20" fill="currentColor"
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
        </svg>
      </button>

      {/* Body */}
      {open && (
        <div className="px-5 py-4 bg-white">
          {section.content_type === 'text' && section.content_text && (
            <p className="text-sm text-gray-700 leading-relaxed">{section.content_text}</p>
          )}
          {section.content_type === 'list' && Array.isArray(section.content_json) && (
            <ul className="space-y-2">
              {(section.content_json as string[]).map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <span className={`shrink-0 mt-0.5 w-5 h-5 rounded-full ${colors.bg} ${colors.icon} flex items-center justify-center text-xs font-bold`}>
                    {i + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          )}
          {section.content_type === 'table' && Array.isArray(section.content_json) && section.content_json.length > 0 && (
            <StyledTable rows={section.content_json as Record<string, unknown>[]} />
          )}
        </div>
      )}
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  completed:   'bg-green-100 text-green-700 border border-green-200',
  processing:  'bg-blue-100 text-blue-700 border border-blue-200',
  failed:      'bg-red-100 text-red-700 border border-red-200',
  queued:      'bg-gray-100 text-gray-600',
}

function OverviewPage() {
  const { id } = useParams({ from: '/sop/$id/overview' })
  const { appUser } = useAuth()
  const canEdit = appUser?.role === 'editor' || appUser?.role === 'admin'
  const queryClient = useQueryClient()
  const [editingCode, setEditingCode] = useState(false)
  const [codeInput, setCodeInput] = useState('')

  const { data: sop } = useQuery({
    queryKey: sopKeys.detail(id),
    queryFn: () => fetchSOP(id),
  })

  const projectCodeMutation = useMutation({
    mutationFn: (code: string | null) => setProjectCode(id, code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sopKeys.detail(id) })
      setEditingCode(false)
    },
  })

  useEffect(() => {
    if (!sop || sop.sections.length === 0) return
    const hash = window.location.hash.slice(1)
    if (!hash) return
    const el = document.getElementById(hash)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [sop])

  if (!sop) return null

  const participants = Array.isArray(sop.meeting_participants) && sop.meeting_participants.length > 0
    ? (sop.meeting_participants as string[])
    : []

  const statusColor = STATUS_COLORS[sop.status] ?? STATUS_COLORS.queued

  return (
    <div className="flex gap-6 items-start">
      {/* ── Main content ───────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* SOP Details card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/>
            </svg>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SOP Details</span>
          </div>
          <div className="px-5 py-4 grid grid-cols-2 gap-x-8 gap-y-3">
            {sop.client_name && (
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300 shrink-0">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd"/>
                </svg>
                <span className="text-xs text-gray-400 w-20 shrink-0">Client</span>
                <span className="text-sm text-gray-800 font-medium">{sop.client_name}</span>
              </div>
            )}
            {sop.process_name && (
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300 shrink-0">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" clipRule="evenodd"/>
                </svg>
                <span className="text-xs text-gray-400 w-20 shrink-0">Process</span>
                <span className="text-sm text-gray-800 font-medium">{sop.process_name}</span>
              </div>
            )}
            {sop.meeting_date && (
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300 shrink-0">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
                </svg>
                <span className="text-xs text-gray-400 w-20 shrink-0">Meeting</span>
                <span className="text-sm text-gray-800">
                  {new Date(sop.meeting_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300 shrink-0">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/>
              </svg>
              <span className="text-xs text-gray-400 w-20 shrink-0">Status</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}>
                {sop.status.replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300 shrink-0">
                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z"/>
              </svg>
              <span className="text-xs text-gray-400 w-20 shrink-0">Steps</span>
              <span className="text-sm font-semibold text-gray-800">{sop.steps.length}</span>
            </div>
            {/* Project Code */}
            <div className="flex items-center gap-2 col-span-2">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300 shrink-0">
                <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
              </svg>
              <span className="text-xs text-gray-400 w-20 shrink-0">Project Code</span>
              {editingCode ? (
                <div className="flex items-center gap-2">
                  <input
                    value={codeInput}
                    onChange={e => setCodeInput(e.target.value.toUpperCase())}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="e.g. AGED-001"
                    maxLength={50}
                  />
                  <button
                    onClick={() => projectCodeMutation.mutate(codeInput || null)}
                    disabled={projectCodeMutation.isPending}
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >Save</button>
                  <button onClick={() => setEditingCode(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-mono font-medium ${sop.project_code ? 'text-blue-600' : 'text-gray-300'}`}>
                    {sop.project_code || 'None'}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => { setCodeInput(sop.project_code || ''); setEditingCode(true) }}
                      className="text-xs text-gray-400 hover:text-blue-500 underline"
                    >{sop.project_code ? 'Edit' : 'Set'}</button>
                  )}
                </div>
              )}
            </div>
            {sop.video_duration_sec != null && (
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300 shrink-0">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
                </svg>
                <span className="text-xs text-gray-400 w-20 shrink-0">Duration</span>
                <span className="text-sm text-gray-800">
                  {Math.floor(sop.video_duration_sec / 60)} min {sop.video_duration_sec % 60} sec
                </span>
              </div>
            )}
          </div>

          {/* Participants */}
          {participants.length > 0 && (
            <div className="px-5 pb-4">
              <div className="flex items-start gap-2">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300 shrink-0 mt-1">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/>
                </svg>
                <span className="text-xs text-gray-400 w-20 shrink-0 mt-1">Participants</span>
                <div className="flex flex-wrap gap-1.5">
                  {participants.map((p) => (
                    <span key={p} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                      <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-[9px] font-bold uppercase">
                        {p[0]}
                      </span>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section cards */}
        {sop.sections.length === 0 ? (
          <div className="text-sm text-gray-400 bg-gray-50 rounded-xl p-6 border border-dashed border-gray-200 text-center">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-gray-300 mx-auto mb-2">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/>
            </svg>
            No sections generated yet.
          </div>
        ) : (
          <div className="space-y-3">
            {sop.sections.map((section) => (
              <SectionCard key={section.id} section={section} />
            ))}
          </div>
        )}
      </div>

      {/* ── Sticky TOC sidebar ─────────────────────────────────────────── */}
      {sop.sections.length > 0 && (
        <div className="hidden lg:block w-44 shrink-0">
          <div className="sticky top-4 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">On this page</span>
            </div>
            <nav className="py-2">
              {sop.sections.map((sec) => {
                const colors = SECTION_COLORS[sec.section_key] ?? DEFAULT_COLOR
                return (
                  <a
                    key={sec.id}
                    href={`#section-${sec.section_key}`}
                    onClick={(e) => {
                      e.preventDefault()
                      document.getElementById(`section-${sec.section_key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors group"
                  >
                    <span className={`shrink-0 ${colors.icon} opacity-70 group-hover:opacity-100`}>
                      {SECTION_ICONS[sec.section_key] ?? null}
                    </span>
                    <span className="leading-tight">{sec.section_title}</span>
                  </a>
                )
              })}
            </nav>
          </div>
        </div>
      )}
    </div>
  )
}
