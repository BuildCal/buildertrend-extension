# bt-service

Python FastAPI sidecar that makes every Buildertrend HTTP call.

Buildertrend’s edge checks TLS fingerprints and rejects clients that do not
look like Chrome. This service uses `curl-cffi` with `impersonate="chrome"`.
Node does not have a clean equivalent, which is why this is separate from
the Next.js app.

**Do not expose this service to the public internet.** Only the web app
should be able to reach it.

## Local development

```bash
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"

cp .env.example .env
# Set INTERNAL_API_TOKEN, SESSION_ENCRYPTION_KEY, DATABASE_URL, BT_BUILDER_ID

uvicorn app.main:app --reload --port 8000
```

OpenAPI docs: http://localhost:8000/docs (disabled when `ENVIRONMENT=production`).

## Deployment

### Fly.io

```bash
fly launch   # one-time, generates fly.toml
fly secrets set INTERNAL_API_TOKEN=<token> SESSION_ENCRYPTION_KEY=<key> DATABASE_URL=<url> BT_BUILDER_ID=<id>
fly deploy
```

Lock the app down with Fly private networking or an IP allow-list so only
the web app can call it.

### Railway / Render

Point the service at this directory. Both detect the Dockerfile.

### Docker

```bash
docker build -t bt-service .
docker run -d --restart unless-stopped --env-file .env -p 8000:8000 bt-service
```

## Auth model

| Hop | Mechanism |
| --- | --- |
| Web app → this service | `X-Internal-Token: $INTERNAL_API_TOKEN` |
| This service → Buildertrend | Encrypted session cookies captured from Chrome |
| Browser → this service | None. Do not allow it. |

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/sessions/refresh` | Admin uploads new BT cookies |
| `GET` | `/sessions/status` | Is the session valid? |
| `POST` | `/bills` | Create a bill in BT |
| `GET` | `/bills` | List bills (grid) |
| `GET` | `/bills/{id}` | Fetch a bill |
| `GET` | `/lookups/jobs` | List jobs |
| `GET` | `/lookups/vendors-for-job/{job_id}` | Vendors assignable on a job |
| `GET` | `/lookups/cost-codes-for-job/{job_id}` | Cost codes for a job |
| `POST` | `/sync/all` | Mirror jobs/vendors/POs/bills into Postgres |
| `GET` | `/sync/status` | Last-synced timestamps |
| `GET` | `/healthz`, `/readyz` | Probes |
