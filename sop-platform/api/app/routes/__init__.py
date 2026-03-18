# Route modules registered in main.py:
#
#   sops.py      — GET /api/sops, GET /api/sops/{id}
#   steps.py     — GET /api/sops/{id}/steps, GET /api/sops/{id}/steps/{step_id}
#   sections.py  — GET /api/sops/{id}/sections, /transcript, /watchlist
#   exports.py   — Phase 5: export generation endpoints
#   media.py     — Phase 4: Azure Blob signed URL generation
#   pipeline.py  — Phase 4: video upload + SSE progress stream
