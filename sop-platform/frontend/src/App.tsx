import { useState, useEffect } from 'react'

type ApiStatus = 'loading' | 'ok' | 'error'

interface HealthResponse {
  status: string
  service: string
}

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('loading')
  const [apiDetail, setApiDetail] = useState<string>('')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<HealthResponse>
      })
      .then((data) => {
        if (data.status === 'ok') {
          setApiStatus('ok')
          setApiDetail(data.service)
        } else {
          setApiStatus('error')
          setApiDetail('unexpected response')
        }
      })
      .catch((err: Error) => {
        setApiStatus('error')
        setApiDetail(err.message)
      })
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-8 p-8">

      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-2">
          SOP Automation Platform
        </h1>
        <p className="text-gray-400 text-lg">
          Starboard Hotels · KT Recording → SOP in ~4 minutes
        </p>
      </div>

      {/* Status Card */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl px-8 py-6 flex flex-col gap-4 w-full max-w-md">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Infrastructure Status
        </h2>

        <div className="flex items-center justify-between">
          <span className="text-gray-300">API Connection</span>
          <span className={
            apiStatus === 'loading' ? 'text-yellow-400' :
            apiStatus === 'ok'      ? 'text-green-400'  :
                                      'text-red-400'
          }>
            {apiStatus === 'loading' && '⏳ Connecting...'}
            {apiStatus === 'ok'      && `✅ ok — ${apiDetail}`}
            {apiStatus === 'error'   && `❌ unreachable — ${apiDetail}`}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Database</span>
          <a href="/api/test-db" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
            /api/test-db →
          </a>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Frame Extractor</span>
          <a href="/api/test-extractor" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
            /api/test-extractor →
          </a>
        </div>
      </div>

      {/* Quick Links */}
      <div className="flex gap-6 text-sm text-gray-500">
        <a href="/api/health"           className="hover:text-white transition-colors">API Health</a>
        <a href="/api/test-db"          className="hover:text-white transition-colors">DB Test</a>
        <a href="/api/test-extractor"   className="hover:text-white transition-colors">Extractor Test</a>
        <a href="http://localhost:5678"
           target="_blank"
           rel="noreferrer"
           className="hover:text-white transition-colors">
          n8n →
        </a>
      </div>

      <p className="text-xs text-gray-700">Phase 1 — Infrastructure scaffold · Build plan: 5 phases</p>
    </div>
  )
}

export default App
