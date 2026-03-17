#!/bin/bash
# ============================================================
# SOP Platform — Infrastructure Verification Script
# 14 checks across all 5 local containers
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
TOTAL=14

# ── Load .env if present ─────────────────────────────────────
if [ -f ".env" ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi
POSTGRES_USER="${POSTGRES_USER:-sop_admin}"
POSTGRES_DB="${POSTGRES_DB:-sop_platform}"

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
# Section 1 — Container Status  (5 checks)
# ============================================================
echo -e "${BOLD}${CYAN}=== Section 1: Container Status ===${NC}"

for container in sop-postgres sop-api sop-extractor sop-frontend sop-n8n; do
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
    check "Frontend serves HTML" 0
else
    check "Frontend serves HTML" 1 "${fe_resp:0:80}..."
fi

echo ""

# ============================================================
# Section 3 — Cross-Container Communication  (3 checks)
# ============================================================
echo -e "${BOLD}${CYAN}=== Section 3: Cross-Container Communication ===${NC}"

# API → Postgres
db_resp=$(curl -sf --max-time 15 http://localhost:8000/api/test-db 2>/dev/null)
if echo "$db_resp" | grep -q '"ok"'; then
    tables=$(echo "$db_resp" | grep -o '"tables_found":[0-9]*' | grep -o '[0-9]*')
    check "API → Postgres" 0 "tables found: ${tables:-?}"
else
    check "API → Postgres" 1 "${db_resp:-no response}"
fi

# API → Extractor
ext_proxy=$(curl -sf --max-time 15 http://localhost:8000/api/test-extractor 2>/dev/null)
if echo "$ext_proxy" | grep -q '"ok"'; then
    check "API → Extractor (cross-service)" 0
else
    check "API → Extractor (cross-service)" 1 "${ext_proxy:-no response}"
fi

# Frontend nginx → API proxy
nginx_resp=$(curl -sf --max-time 15 http://localhost:5173/api/health 2>/dev/null)
if echo "$nginx_resp" | grep -q '"ok"'; then
    check "Frontend nginx → API proxy (/api/health)" 0
else
    check "Frontend nginx → API proxy (/api/health)" 1 "${nginx_resp:-no response}"
fi

echo ""

# ============================================================
# Section 4 — Database Schema  (1 check)
# ============================================================
echo -e "${BOLD}${CYAN}=== Section 4: Database Schema ===${NC}"

table_count=$(docker exec sop-postgres psql \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" \
    2>/dev/null | tr -d ' \n')

if [[ "$table_count" =~ ^[0-9]+$ ]] && [ "$table_count" -ge 10 ]; then
    check "PostgreSQL schema applied" 0 "${table_count} public tables (expect 10+)"
else
    check "PostgreSQL schema applied" 1 "expected 10+ tables, got: '${table_count:-error}'"
fi

echo ""

# ============================================================
# Section 5 — Tool Availability  (2 checks)
# ============================================================
echo -e "${BOLD}${CYAN}=== Section 5: Tool Availability ===${NC}"

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
    check "Data volume mounted and writable" 0 "all 4 subdirectories present"
else
    check "Data volume mounted and writable" 1 "${vol_resp:-no response}"
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
else
    echo -e "${RED}${BOLD}${FAIL} check(s) failed. Review the output above.${NC}"
    echo -e "${YELLOW}Tip: docker compose logs <service-name>${NC}"
fi
echo ""
