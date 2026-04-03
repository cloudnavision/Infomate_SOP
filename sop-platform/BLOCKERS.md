# Blockers

## 🔴 Bot Fight Mode — n8n Phase 3 Blocked

**Status:** Unresolved — awaiting TL action
**Affects:** Workflow 2 (Frame Extraction) — `Call Frame Extractor` node

### What is blocked
n8n cannot POST to `soptest.cloudnavision.com/api/extract`.
Phase 3 (Frame Extraction) cannot run until this is resolved.

### Error
```
HTTP 403 — Forbidden
cType: managed
"Enable JavaScript and cookies to continue"
```

### Root Cause
Cloudflare **Bot Fight Mode** is enabled for `soptest.cloudnavision.com`.
It detects n8n's HTTP client as a bot and blocks it at the edge before
the request reaches the tunnel or sop-api.

curl passes (looks like a browser tool).
n8n fails (identified as automated HTTP client, can't solve JS challenge).

### What works
- curl → `soptest.cloudnavision.com/api/extract` → 500 ✅ (proxy chain works)
- Browser → `soptest.cloudnavision.com/docs` ✅
- Tunnel connected (all 4 connections registered) ✅
- sop-api → sop-extractor internal proxy ✅

### How it works from FastAPI (tested & confirmed)

Sending a POST directly to the FastAPI proxy endpoint **works end-to-end**:

```bash
curl -X POST http://localhost:8000/api/extract \
  -H "x-internal-key: sop-pipeline-2024" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_run_id": "<uuid>", "video_url": "<azure-blob-url>"}'
```

Full flow when called via FastAPI directly:
```
FastAPI /api/extract (sop-api:8000)
  ↓ validates x-internal-key header
  ↓ proxies to http://sop-extractor:8001/extract (Docker internal DNS)
sop-extractor
  ↓ downloads video from Azure Blob
  ↓ runs FFmpeg + PySceneDetect frame extraction
  ↓ saves frames to Azure Blob
  ↓ updates pipeline_runs in Supabase (status, frame_count, frame_urls)
```

**The entire pipeline (download → extract → upload → Supabase update) works correctly when called from FastAPI.**
The only broken piece is n8n → Cloudflare edge (Bot Fight Mode blocks before request reaches our server).

### Fix Required (TL must action)

**Option 1 — Turn off Bot Fight Mode globally:**
> Cloudflare Dashboard → soptest.cloudnavision.com → Security → Bots → turn off Bot Fight Mode

**Option 2 — WAF Skip Rule (safer, targeted):**
> Cloudflare Dashboard → soptest.cloudnavision.com → Security → WAF → Custom Rules
> - If: Request Header `x-internal-key` equals `sop-pipeline-2024`
> - Action: Skip → Bot Fight Mode
>
> This keeps Bot Fight Mode ON for public traffic, only n8n bypasses it
> (n8n already sends `x-internal-key: sop-pipeline-2024` in every request)

### Message to send TL
> "n8n is blocked by Cloudflare Bot Fight Mode on soptest.cloudnavision.com.
> Tunnel is working fine (curl tests pass). But n8n's HTTP client gets flagged
> as a bot and blocked before reaching our API (cType: managed).
>
> Two options:
> 1. Turn off Bot Fight Mode → Security → Bots
> 2. WAF Custom Rule: when header x-internal-key = sop-pipeline-2024, skip Bot Fight Mode"

### Architecture context
```
n8n (cloud)
  ↓ POST /api/extract
Cloudflare Edge ← Bot Fight Mode blocks here ❌
  ↓ (if allowed) QUIC tunnel
cloudflared (sideloaded inside sop-api container)
  ↓ 127.0.0.1:8000
FastAPI /api/extract
  ↓ http://sop-extractor:8001/extract (Docker internal DNS)
sop-extractor → FFmpeg + PySceneDetect
```
