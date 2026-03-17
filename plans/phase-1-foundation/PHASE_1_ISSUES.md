# Phase 1 — Issues Log

| # | Issue | Symptom | Fix | Status |
|---|-------|---------|-----|--------|
| 1 | Docker not found in WSL | `docker: command not found` when running `docker compose up` in WSL terminal | Open Docker Desktop → Settings → Resources → WSL Integration → enable for your distro → restart WSL | Fixed |
| 2 | Permission denied on docker.sock | `permission denied while trying to connect to the Docker daemon socket` | Run `sudo docker compose up -d` or add user to docker group: `sudo usermod -aG docker $USER` then restart shell | Fixed |
| 3 | `docker-compose.yml` version warning | `version is obsolete` warning printed on every `docker compose` command | Cosmetic only. Removed the `version: "3.8"` line from `docker-compose.yml` — Docker Compose v2 does not require it | Fixed |
| 4 | Windows line endings in verify script | `verify_infrastructure.sh: line 2: $'\r': command not found` | Run: `sed -i 's/\r$//' scripts/verify_infrastructure.sh` then re-run the script | Fixed |
| 5 | Windows line endings in `.env` | Container fails to read env vars; DATABASE_URL contains trailing `\r`, connection fails | Run: `sed -i 's/\r$//' .env` — or re-create `.env` from `.env.example` in a Unix editor | Fixed |
| 6 | Schema check false negative (verify check 4) | Section 4 of verify script reports `expected 10+ tables, got: error` even after schema applies correctly | Root cause was `.env` Windows line endings (issue 5) — `POSTGRES_USER` had `\r` appended, causing `psql` auth failure. Resolved by fix #5. | Fixed |
| 7 | n8n creates 60+ extra tables | `SELECT COUNT(*) FROM information_schema.tables` returns 70+ instead of expected 12 | n8n stores its own data in the shared `sop_platform` database. Cosmetic — no impact on app. Verify script threshold is `10+` to accommodate this. | Minor |
