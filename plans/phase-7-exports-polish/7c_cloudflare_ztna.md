# 7c: Cloudflare ZTNA

**Status: ⬜ Deferred — no code changes needed**

Exposes `sop-frontend` externally at `sop.cloudnavision.com` using the existing Cloudflare tunnel.
Currently only `sop-api` is externally accessible at `soptest.cloudnavision.com`.

## Steps (all in Cloudflare Zero Trust dashboard — no code)

### 1. Add public hostname to existing tunnel
Zero Trust → Networks → Tunnels → [existing tunnel] → Public Hostnames → Add:
```
Subdomain: sop
Domain:    cloudnavision.com
Service:   http://sop-frontend:5173
```

### 2. Create Access application
Zero Trust → Access → Applications → Add:
```
Name:   SOP Platform
Domain: sop.cloudnavision.com
Policy: Allow — Email ends in @keells.com OR @cloudnavision.com
```

### 3. Update .env
```env
VITE_API_URL=https://soptest.cloudnavision.com
CORS_ORIGINS=["https://sop.cloudnavision.com","http://localhost:5173","http://localhost:3000"]
```

### 4. Rebuild frontend
```bash
docker compose build sop-frontend && docker compose up -d sop-frontend
```

## Who needs access
- Cloudflare Zero Trust dashboard access (TL owns `cloudnavision.com`)
- Confirm with TL before proceeding
