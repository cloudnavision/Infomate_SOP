# Phase 1 — Issues & Fixes

| # | Issue | Fix | Status |
|---|---|---|---|
| 1 | Docker not found in WSL | Enable WSL integration in Docker Desktop → Settings → Resources → WSL integration | ✅ Fixed |
| 2 | Permission denied on docker.sock | Use sudo docker compose or add user to docker group | ✅ Fixed |
| 3 | docker-compose.yml version warning | Removed obsolete version line — Docker Compose v2 doesn't need it | ✅ Fixed |
| 4 | Windows line endings in verify script | sed -i 's/\r$//' scripts/verify_infrastructure.sh | ✅ Fixed |
| 5 | Windows line endings in .env | sed -i 's/\r$//' .env | ✅ Fixed |
| 6 | Schema check false negative | Caused by .env line endings — fixed after sed cleanup | ✅ Fixed |
| 7 | n8n tables in same database | Cosmetic issue — resolved when n8n container was removed in architecture update | ✅ Resolved |
| 8 | Architecture change (6→3 containers) | Removed sop-postgres, sop-n8n, sop-tunnel from docker-compose. Updated to Supabase, external n8n, Cloudflare sideloading | ✅ Updated |
| 9 | npm ci missing package-lock.json | Ran npm install in frontend/ to generate package-lock.json before Docker build | ✅ Fixed |
| 10 | Old containers lingering after compose update | sop-postgres and sop-n8n still running after removal from compose — used sudo docker stop + rm | ✅ Fixed |
| 11 | Frontend still running nginx after Dockerfile update | Old image cached — rebuilt with sudo docker compose up -d --build sop-frontend | ✅ Fixed |
| 12 | API routes returning "Not Found" after architecture update | API container running old code — rebuilt with sudo docker compose up -d --build sop-api | ✅ Fixed |
| 13 | Supabase tables empty | Schema and seed data were in old local Postgres — re-applied both SQL files via Supabase SQL Editor | ✅ Fixed |
