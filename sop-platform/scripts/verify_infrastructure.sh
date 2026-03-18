#!/bin/bash
# ============================================================
# SOP Platform — Infrastructure Verification Script
# 11 checks across 3 local containers + external Supabase
#
# Architecture: 3 Docker containers + external services
#   - sop-frontend  (Vite / serve)  :5173
#   - sop-api       (FastAPI)        :8000
#   - sop-extractor (FFmpeg+Python)  :8001
#   - Database: Supabase (external, verified via /api/test-db)
#   - n8n:      External hosted (not verified here)
#   - Cloudflare Tunnel: Host daemon (not verified here)
#
# Usage: bash scripts/verify_infrastructure.sh
# Run from: sop-platform/ directory
# ============================================================

# ── Colours ──────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=11

# ── Helper: record a single check result ─────────────────────
check() {
    local name="$1"
    local code="$2"
    local detail="${3:-}"
    if [ "$code" -eq 0 ]; then
        echo -e "  ${GREEN}✅${NC} ${name}${detail:+  (${detail})}"
        ((PASS++))
    else
        echo -e "  ${RED}❌${NC} ${name}${detail:+  (${detail})}"
        ((FAIL++))
    fi
}

# ── Startup delay ─────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Waiting for containers to be ready...${NC}"
sleep 5
echo ""

# ============================================================
# Section 1 — Container Status  (3 checks)
# ============================================================
echo -e "${BOLD}${CYAN}=== Section 1: Container Status ===${NC}"

for container in sop-frontend sop-api sop-extractor; do
    running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null)
    if [ "$running" = "true" ]; then
        check "$container is running" 0
    else
        check "$container is running" 1 "not found or not running"
    fi
done

echo ""

# ============================================================
# Section 2 — Health Checks  (3 checks)
# ============================================================
echo -e "${BOLD}${CYAN}=== Section 2: Health Checks ===${NC}"

# API direct health
api_resp=$(curl -sf --max-time 10 http://localhost:8000/health 2>/dev/null)
if echo "$api_resp" | grep -q '"ok"'; then
    check "API /health returns ok" 0
else
    check "API /health returns ok" 1 "${api_resp:-no response}"
fi

# Extractor direct health
ext_resp=$(curl -sf --max-time 10 http://localhost:8001/health 2>/dev/null)
if echo "$ext_resp" | grep -q '"ok"'; then
    check "Extractor /health returns ok" 0
else
    check "Extractor /health returns ok" 1 "${ext_resp:-no response}"
fi

# Frontend serves HTML
fe_resp=$(curl -sf --max-time 10 http://localhost:5173 2>/dev/null)
if echo "$fe_resp" | grep -qi 'html'; then
    check "Frontend serves HTML at localhost:5173" 0
else
    check "Frontend serves HTML at localhost:5173" 1 "${fe_resp:0:80}..."
fi

echo ""

# ============================================================
# Section 3 — External Connectivity  (2 checks)
# ============================================================
echo -e "${BOLD}${CYAN}=== Section 3: External Connectivity ===${NC}"

# API → Supabase (via SQLAlchemy async session, transaction pooler port 6543)
db_resp=$(curl -sf --max-time 20 http://localhost:8000/api/test-db 2>/dev/null)
if echo "$db_resp" | grep -q '"ok"'; then
    sop_count=$(echo "$db_resp" | grep -o '"sop_count":[0-9]*' | grep -o '[0-9]*')
    check "API → Supabase (transaction pooler)" 0 "sop_count: ${sop_count:-?}"
else
    check "API → Supabase (transaction pooler)" 1 "${db_resp:-no response}"
fi

# API → Extractor (cross-container via sop-network)
ext_proxy=$(curl -sf --max-time 15 http://localhost:8000/api/test-extractor 2>/dev/null)
if echo "$ext_proxy" | grep -q '"ok"'; then
    check "API → Extractor (cross-container)" 0
else
    check "API → Extractor (cross-container)" 1 "${ext_proxy:-no response}"
fi

echo ""

# ============================================================
# Section 4 — Tool Availability  (2 checks)
# ============================================================
echo -e "${BOLD}${CYAN}=== Section 4: Tool Availability ===${NC}"

# FFmpeg
ffmpeg_resp=$(curl -sf --max-time 15 http://localhost:8001/test-ffmpeg 2>/dev/null)
if echo "$ffmpeg_resp" | grep -qi 'ffmpeg'; then
    version=$(echo "$ffmpeg_resp" | grep -o '"ffmpeg_version":"[^"]*"' | cut -d'"' -f4 | cut -c1-60)
    check "FFmpeg available in extractor" 0 "${version}"
else
    check "FFmpeg available in extractor" 1 "${ffmpeg_resp:-no response}"
fi

# Data volume
vol_resp=$(curl -sf --max-time 15 http://localhost:8001/test-data-volume 2>/dev/null)
if echo "$vol_resp" | grep -q '"data_writable":true'; then
    check "Shared /data volume mounted and writable" 0 "all 4 subdirectories present"
else
    check "Shared /data volume mounted and writable" 1 "${vol_resp:-no response}"
fi

echo ""

# ============================================================
# Section 5 — Frontend API Access  (1 check)
# ============================================================
echo -e "${BOLD}${CYAN}=== Section 5: Frontend API Access ===${NC}"

# Frontend calls API directly via VITE_API_URL (no nginx proxy)
api_health_resp=$(curl -sf --max-time 10 http://localhost:8000/api/health 2>/dev/null)
if echo "$api_health_resp" | grep -q '"ok"'; then
    check "API reachable at localhost:8000 (VITE_API_URL target)" 0
else
    check "API reachable at localhost:8000 (VITE_API_URL target)" 1 "${api_health_resp:-no response}"
fi

echo ""

# ============================================================
# Summary
# ============================================================
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}Summary: ${PASS} passed, ${FAIL} failed out of ${TOTAL}${NC}"
echo ""
if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}🎉 All checks passed! Infrastructure is ready.${NC}"
    echo ""
    echo -e "${CYAN}External services (not verified here):${NC}"
    echo -e "  • Supabase dashboard:   https://supabase.com/dashboard"
    echo -e "  • n8n instance:         configure N8N_WEBHOOK_BASE_URL in .env"
    echo -e "  • Cloudflare Tunnel:    run 'cloudflared tunnel run' on host"
else
    echo -e "${RED}${BOLD}${FAIL} check(s) failed. Review the output above.${NC}"
    echo -e "${YELLOW}Tip: docker compose logs <service-name>${NC}"
fi
echo ""
