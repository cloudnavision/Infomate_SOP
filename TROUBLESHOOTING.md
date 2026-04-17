# SOP Platform — Troubleshooting Guide

---

## Cloudflare Tunnel — Error 530 / QUIC Timeout

**Symptom:**
- Workflow 4 (clips) fails with `Error 530 - Cloudflare Tunnel error`
- `docker logs sop-tunnel` shows repeated errors:
  ```
  ERR Failed to dial a quic connection error="failed to dial to edge with quic: timeout: no recent network activity"
  ```

**Cause:**
UDP port 7844 (QUIC protocol) is being blocked by the network/firewall. Cloudflared defaults to QUIC and can't connect to Cloudflare's edge.

**Fix:**
Simply restart the tunnel container — cloudflared will fall back to a working protocol:
```bash
docker restart sop-tunnel
```

**Verify it's working:**
```bash
docker logs sop-tunnel --tail 20
```
Look for `INF Connection established` — that confirms it's connected.

**If restart doesn't fix it:**
Force HTTP/2 protocol by updating `docker-compose.yml`:
```yaml
# Change this line in sop-tunnel service:
command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}

# To this:
command: tunnel --no-autoupdate --protocol http2 run --token ${CLOUDFLARE_TUNNEL_TOKEN}
```
Then restart:
```bash
docker compose up -d sop-tunnel
```

---

## Extractor Container Down

**Symptom:**
- Workflow 4 fails with 530 or connection refused
- `docker ps` shows `sop-extractor` not running

**Fix:**
```bash
cd "d:/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform"
docker compose up -d sop-extractor
```
