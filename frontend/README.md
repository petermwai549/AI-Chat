# AI Agent frontend

React + Vite + Tailwind. Talks to the APISIX gateway (`/api/v1/*`) and Casdoor
(`/auth/*`) as two separate services — this app is intentionally independent
of both, portable to any static host later.

## Local development

```bash
npm install
cp .env.example .env   # then fill in real values — see below
npm run dev
```

## Config (`.env`)

| Variable | What it is |
|---|---|
| `VITE_API_ORIGIN` | Your APISIX gateway's public URL (e.g. `http://localhost:6080`) |
| `VITE_CASDOOR_CLIENT_ID` | This application's Client ID from Casdoor |
| `VITE_CASDOOR_CLIENT_SECRET` | Its Client Secret — see the security note in `src/config.js` before shipping this anywhere public |
| `VITE_API_KEY` | The APISIX consumer key required by the `/api/v1/*` routes |

**Casdoor's Redirect URL for this application must exactly match wherever
this app is actually served** (e.g. `http://localhost:5173/` in local dev).
Update it in Casdoor's Applications → OIDC/OAuth tab whenever this
moves to a new host.

## Running via Docker (optional, standalone)

Not part of the backend's `docker-compose.yml` on purpose — this project
deploys independently. If you want a containerized version anyway (for a
VPS, or just to test the production build locally):

```bash
docker build -t agent-frontend .
docker run -p 5173:80 agent-frontend
```

## Moving this to a real static host later

Nothing here is Docker-specific — `npm run build` produces a plain `dist/`
folder. Deploy it to Vercel, Netlify, S3+CloudFront, or anywhere else that
serves static files. Update `VITE_API_ORIGIN` for the new environment and
Casdoor's Redirect URL to match the new domain; nothing on the backend needs
to change.
