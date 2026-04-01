# Phase 3 — Issues Log

---

## Issue 1: [BLOCKED] Cloudflare Bot Fight Mode — HTTP 403

**Severity:** Critical — blocks all n8n → sop-api communication

**Status:** Waiting on TL

**Description:**
n8n cannot POST to `https://soptest.cloudnavision.com/api/extract`. Cloudflare's Bot Fight Mode intercepts the request and returns HTTP 403 with an HTML challenge page ("Enable JavaScript and cookies to continue") before the request ever reaches the `sop-api` container.

**Error details:**
- HTTP status: `403`
- Response body: HTML page (not JSON)
- Cloudflare header: `cType: managed`
- Root cause: n8n HTTP Request node is a server-side tool — it cannot execute JavaScript, so the Cloudflare JS challenge cannot be satisfied

**Fix required (TL action):**

Option A (Recommended): Add WAF Skip Rule
1. Cloudflare Dashboard → soptest.cloudnavision.com → Security → WAF → Custom Rules
2. Create rule: "Skip Bot Fight Mode for n8n"
3. Condition: `http.request.headers["x-internal-key"] eq "sop-pipeline-2024"`
4. Action: Skip → Bot Fight Mode

Option B: Disable Bot Fight Mode entirely (less secure, not recommended for production)

Option C: Route n8n through a self-hosted proxy on the same server that bypasses Cloudflare (architectural change — not preferred)

**Work unblocked while waiting:**
- sop-extractor local development and testing (`curl` directly to port 8001)
- Phase 3 n8n node design (can be designed but not tested)
- Phase 4 annotation design

**Reference:** See `BLOCKERS.md` in repo root for full details.

---

## Issue 2: [RESOLVED] Docker network — sop-extractor accessibility

**Severity:** High (was blocking, now resolved)

**Status:** Resolved — closed 2026-03-20

**Description:**
`sop-extractor` was briefly configured with `network_mode: "host"` (copied from `cloudflared` pattern). This caused:
1. Docker DNS `sop-extractor` hostname stopped resolving
2. sop-extractor appeared on host network but not on `sop-network` bridge
3. sop-api proxy calls to `http://sop-extractor:8001` returned connection refused

**Root cause:**
`cloudflared` uses `network_mode: host` because it needs to bind to the host's network stack for tunnel management. This pattern is NOT appropriate for `sop-extractor`, which should only be accessible within the Docker bridge network.

**Resolution:**
- Reverted `sop-extractor` to standard bridge network mode (`networks: [sop-network]`)
- Removed `ports: "8001:8001"` mapping (internal only — no external exposure needed)
- `sop-api` accesses extractor via Docker DNS: `http://sop-extractor:8001`

**Verification:**
```bash
docker exec sop-api curl http://sop-extractor:8001/health
# Should return: {"status": "ok", "service": "sop-extractor"}
```

---

## Issue 3: [OPEN] Video URL format validation

**Severity:** Medium

**Status:** Open — needs verification before Phase 3 end-to-end test

**Description:**
The `sop-extractor` `POST /extract` endpoint expects an Azure Blob URL with a valid SAS token in the `video_url` field. The URL is stored in `pipeline_runs.video_blob_url` by the Phase 2 ingestion workflow.

The extractor downloads the video using this URL via `httpx` (or `aiofiles`). If the SAS token has expired or the URL format differs from what the extractor expects, the download will fail with a 403 from Azure Blob Storage.

**Things to verify:**
1. Confirm the URL pattern stored in `pipeline_runs.video_blob_url` by Phase 2 matches:
   `https://{account}.blob.core.windows.net/{container}/{sop_id}/video.mp4?sv=...&sig=...`
2. Confirm the SAS token expiry is set far enough in the future that it will still be valid when Phase 3 runs (Phase 2 generates the SAS token at upload time — check the expiry)
3. Confirm the Azure Blob container and path structure: Phase 2 writes to `infsop` container. Phase 3 reads from same container.
4. Confirm the extractor has network access to Azure Blob (test: `docker exec sop-extractor curl -I "{video_url}"`)

**Action required:** Developer to verify during first Phase 3 integration test.

---

_Last updated: 2026-03-27_
