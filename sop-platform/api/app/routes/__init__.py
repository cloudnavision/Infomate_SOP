# Implemented in Phase 2
# Route modules registered here:
#
#   sops.py     — GET/POST /api/sops, GET/PATCH /api/sops/:id
#   steps.py    — GET/PATCH /api/sops/:id/steps
#   exports.py  — POST /api/exports (triggers Workflow 3 webhook)
#   media.py    — GET /api/media/* (signed Blob URL generation)
#   pipeline.py — POST /api/pipeline/start, GET /api/pipeline/:id/progress (SSE)
