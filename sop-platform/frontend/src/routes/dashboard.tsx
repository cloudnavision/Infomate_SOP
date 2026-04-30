import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSOPs, sopKeys } from '../api/client'
import { SOPCard } from '../components/SOPCard'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { useAuth } from '../hooks/useAuth'

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

function Dashboard() {
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const { appUser } = useAuth()
  const canMerge = appUser?.role === 'editor' || appUser?.role === 'admin'
  const { data: sops, isLoading, error } = useQuery({
    queryKey: sopKeys.all,
    queryFn: fetchSOPs,
  })

  if (isLoading) return <p className="text-muted">Loading SOPs...</p>
  if (error) return <p className="text-red-600">Error loading SOPs: {(error as Error).message}</p>
  if (!sops || sops.length === 0) return <p className="text-muted">No SOPs found.</p>

  const recordings = sops.filter(s => !s.is_merged)

  // All unique tag names across recordings only
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

  function handleSearch(val: string) {
    setSearch(val)
    setPage(1)
  }

  function toggleTag(tag: string) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
    setPage(1)
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-default">Dashboard</h1>
        {canMerge && (
          <Link
            to="/merge"
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 transition-colors shadow-sm"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 8a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zm6-6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zm0 8a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" clipRule="evenodd"/>
            </svg>
            Merge SOPs
          </Link>
        )}
      </div>

      {/* Recordings section */}
      <div>
        <h2 className="text-base font-semibold text-secondary mb-3">Recordings</h2>

        <input
          type="text"
          placeholder="Search SOPs or tags…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full mb-3 px-3 py-2 bg-input border border-default rounded-lg text-sm text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-400/30"
        />

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                  selectedTags.includes(tag)
                    ? tagColor(tag) + ' ring-2 ring-offset-1 ring-current'
                    : 'bg-raised text-muted border-default hover:border-default'
                }`}
              >
                {tag}
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button
                onClick={() => { setSelectedTags([]); setPage(1) }}
                className="text-xs px-2.5 py-1 rounded-full border border-dashed border-default text-muted hover:text-secondary"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="text-muted">No SOPs match your filters.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paginated.map((sop) => (
                <SOPCard key={sop.id} sop={sop} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <p className="text-sm text-muted">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm rounded-md border border-default text-muted hover:bg-raised disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ‹ Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`px-3 py-1.5 text-sm rounded-md border ${
                        n === currentPage
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-default text-muted hover:bg-raised'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm rounded-md border border-default text-muted hover:bg-raised disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next ›
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  )
}
