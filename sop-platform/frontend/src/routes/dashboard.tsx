import { useState, useRef, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSOPs, sopKeys } from '../api/client'
import { SOPCard } from '../components/SOPCard'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { useAuth } from '../hooks/useAuth'
import { PageLoader, PageError } from '../components/PageLoader'

export const Route = createFileRoute('/dashboard')({
  component: () => (
    <ProtectedRoute requiredRole="viewer">
      <Dashboard />
    </ProtectedRoute>
  ),
})

const PAGE_SIZE = 6

const TAG_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-green-100 text-green-700 border-green-200',
  'bg-orange-100 text-orange-700 border-orange-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
]

function tagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_COLORS[hash % TAG_COLORS.length]
}

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent)
const shortcutLabel = isMac ? '⌘K' : 'Ctrl K'

function Dashboard() {
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { appUser } = useAuth()
  const canMerge = appUser?.role === 'editor' || appUser?.role === 'admin'

  const { data: sops, isLoading, error } = useQuery({
    queryKey: sopKeys.all,
    queryFn: fetchSOPs,
  })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape' && focused) {
        handleSearch('')
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused])

  if (isLoading) return <PageLoader label="Loading recordings…" />
  if (error) return <PageError message={`Failed to load recordings: ${(error as Error).message}`} />
  if (!sops || sops.length === 0) return <PageError message="No recordings found." />

  const recordings = sops.filter(s => !s.is_merged)
  const allTags = Array.from(new Set(recordings.flatMap(s => (s.tags || []).map(t => t.name)))).sort()

  const filtered = recordings.filter((s) => {
    const q = search.toLowerCase()
    const tagNames = (s.tags || []).map(t => t.name)
    const matchesText = !q || (
      s.title.toLowerCase().includes(q) ||
      (s.client_name ?? '').toLowerCase().includes(q) ||
      (s.process_name ?? '').toLowerCase().includes(q) ||
      tagNames.some(n => n.toLowerCase().includes(q))
    )
    const matchesTags = selectedTags.length === 0 || selectedTags.every(t => tagNames.includes(t))
    return matchesText && matchesTags
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const currentPage = Math.min(page, totalPages || 1)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const isFiltering = search.trim() !== '' || selectedTags.length > 0

  function handleSearch(val: string) { setSearch(val); setPage(1) }
  function toggleTag(tag: string) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
    setPage(1)
  }
  function clearAll() { setSearch(''); setSelectedTags([]); setPage(1) }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-default">Dashboard</h1>
        {canMerge && (
          <Link
            to="/merge"
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 active:scale-95 transition-all shadow-sm"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 8a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zm6-6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zm0 8a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" clipRule="evenodd"/>
            </svg>
            Merge SOPs
          </Link>
        )}
      </div>

      {/* Unified search + filter panel */}
      <div className={`rounded-2xl border bg-card shadow-sm transition-all duration-200 ${
        focused ? 'border-blue-500 shadow-blue-500/10 shadow-lg' : 'border-subtle'
      }`}>
        {/* Search row */}
        <div className="flex items-center px-4 py-3 gap-3">
          <svg
            className={`w-4 h-4 shrink-0 transition-colors duration-200 ${focused ? 'text-blue-500' : 'text-muted'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            placeholder={`Search ${recordings.length} recording${recordings.length !== 1 ? 's' : ''}…`}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="flex-1 bg-transparent text-sm text-default placeholder:text-muted focus:outline-none"
          />

          <div className="flex items-center gap-2 shrink-0">
            {isFiltering ? (
              <>
                <span className="text-xs text-muted tabular-nums">
                  {filtered.length} / {recordings.length}
                </span>
                <button
                  onMouseDown={(e) => { e.preventDefault(); clearAll(); inputRef.current?.focus() }}
                  className="flex items-center gap-1 text-xs text-muted hover:text-red-400 bg-raised hover:bg-red-500/10 border border-default hover:border-red-400/30 px-2 py-1 rounded-lg transition-all"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear
                </button>
              </>
            ) : (
              <kbd className={`hidden sm:flex items-center gap-0.5 text-[10px] font-medium text-muted bg-raised border border-subtle px-1.5 py-0.5 rounded-md transition-opacity duration-200 select-none ${focused ? 'opacity-0' : 'opacity-60'}`}>
                {shortcutLabel}
              </kbd>
            )}
          </div>
        </div>

        {/* Tag filter row — only shown when tags exist */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 border-t border-subtle pt-2.5">
            <span className="text-[11px] font-medium text-muted uppercase tracking-wide mr-1">Tags</span>
            {allTags.map(tag => {
              const active = selectedTags.includes(tag)
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium transition-all duration-150 ${
                    active
                      ? tagColor(tag) + ' ring-1 ring-offset-1 ring-current scale-105'
                      : 'bg-raised text-muted border-default hover:text-secondary hover:border-blue-400/40 hover:scale-105'
                  }`}
                >
                  {active && (
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {tag}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-raised border border-subtle flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-secondary mb-1">No recordings found</p>
          <p className="text-xs text-muted mb-4">Try different keywords or remove some filters</p>
          <button
            onClick={clearAll}
            className="text-xs font-medium text-blue-500 hover:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-4 py-2 rounded-xl transition-all"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          {/* Subtle count row */}
          <div className="flex items-center justify-between px-0.5">
            <p className="text-xs text-muted">
              {isFiltering
                ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${search || selectedTags.join(', ')}"`
                : `${recordings.length} recording${recordings.length !== 1 ? 's' : ''}`
              }
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paginated.map((sop) => (
              <SOPCard key={sop.id} sop={sop} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs rounded-lg border border-default text-muted hover:bg-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ‹ Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`w-8 h-8 text-xs rounded-lg border transition-colors ${
                      n === currentPage
                        ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                        : 'border-default text-muted hover:bg-raised'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-xs rounded-lg border border-default text-muted hover:bg-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next ›
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
