# Troubleshooting / Known Gotchas

Things that cost real debugging time during development. Check here before
re-diagnosing from scratch.

## "It works with curl but not in my browser"

If a port is published as `127.0.0.1:PORT:PORT` (IPv4 only) and your
browser resolves `localhost` to `::1` (IPv6) first, you'll get "connection
refused" in the browser while `curl http://127.0.0.1:PORT` works fine.
Bind both explicitly in `docker-compose.yml`:
```yaml
ports:
  - "127.0.0.1:5270:5270"
  - "[::1]:5270:5270"
```

## Editing `gateway/apisix_config.yaml` does nothing

`gateway/config.yaml` sets `config_provider: etcd` — APISIX reads its live
routing/CORS config from **etcd**, not from the mounted
`apisix_config.yaml` file. That file can describe a different route
structure than what's actually running. To change a route for real, write
to etcd via the Admin API:
```bash
curl -X PUT http://127.0.0.1:9180/apisix/admin/routes/<id> \
  -H "X-API-KEY: <admin_key from gateway/config.yaml>" \
  -H "Content-Type: application/json" \
  -d '{ ...full route JSON... }'
```
To see what's actually live:
```bash
docker exec apisix-etcd etcdctl get /apisix/routes --prefix
```

## APISIX Admin API returns 403 even with the right key

`allow_admin` defaults to `127.0.0.0/24` (true loopback) if not set in
`config.yaml`. A request via Docker's published port arrives *inside* the
container from the bridge gateway address (e.g. `172.18.0.1`), which falls
outside that default — rejected before your API key is even checked. Fix:
```yaml
# gateway/config.yaml
deployment:
  admin:
    allow_admin:
      - 127.0.0.0/24
      - 172.16.0.0/12   # Docker's default bridge network range
```

## CORS errors after changing the frontend's URL/port

Three separate places need updating together, or you'll get
`redirect_uri_mismatch` or a silent CORS failure:
1. Google Cloud Console → OAuth client → Authorized redirect URIs
2. APISIX routes' `cors.allow_origins` (via the Admin API, see above)
3. `frontend/.env`'s `VITE_API_ORIGIN`, if the gateway URL itself changed

If `OPTIONS` succeeds (200) but the real request never fires, the
preflight *response headers* didn't satisfy the browser — check directly:
```bash
curl -i -X OPTIONS http://localhost:6080/api/auth/google/callback \
  -H "Origin: http://localhost:5270" \
  -H "Access-Control-Request-Method: POST"
```
Look for `Access-Control-Allow-Origin` in the response.

## `frontend/Dockerfile.dev` vs `Dockerfile`

`Dockerfile.dev` (Vite dev server, hot reload) is what actually runs day
to day. `Dockerfile` (nginx + production static build) is for occasional
manual pre-deploy checks only — changing one doesn't affect the other.
