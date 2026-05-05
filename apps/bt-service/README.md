# bt-service

Python FastAPI service that proxies all Buildertrend API calls.

This service exists because Buildertrend's edge layer checks the TLS
fingerprint of incoming connections and rejects anything that doesn't
look like Chrome. We use `curl-cffi` with `impersonate="chrome"` to
make this work — Node.js doesn't have a clean equivalent, which is why
this is a separate service from the Next.js frontend.

## Local development

```bash
# Set up venv
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"

# Configure
cp .env.example .env
# Generate INTERNAL_API_TOKEN and SESSION_ENCRYPTION_KEY (see .env.example)

# Run
uvicorn app.main:app --reload --port 8000
```

API docs at http://localhost:8000/docs (development only).

## Deployment options

### Fly.io (recommended for this app's size)

```bash
fly launch  # one-time, generates fly.toml
fly secrets set INTERNAL_API_TOKEN=<token> SESSION_ENCRYPTION_KEY=<key> ...
fly deploy
```

### Railway / Render

Both work — point at this directory, they'll detect the Dockerfile.

### DigitalOcean droplet

```bash
docker build -t bt-service .
docker run -d --restart unless-stopped \
  --env-file .env -p 8000:8000 bt-service
```

## Auth model

- **Web app → this service:** shared `INTERNAL_API_TOKEN` header
- **This service → Buildertrend:** stored session cookies (encrypted at rest)
- **No public endpoints.** Lock this service down with firewall rules
  / a private network so only the web app can reach it.

## Endpoints

- `POST /sessions/refresh` — admin uploads new BT cookies
- `GET /sessions/status` — is the session still valid?
- `POST /bills` — create a bill in BT
- `GET /bills/{id}` — fetch a bill
- `GET /lookups/jobs` — list jobs
- `GET /lookups/vendors-for-job/{job_id}` — list vendors assignable to bills
  for a job
- `GET /lookups/cost-codes-for-job/{job_id}` — list cost codes for a job
- `GET /healthz`, `/readyz` — probes
