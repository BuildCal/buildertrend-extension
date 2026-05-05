# Buildertrend Tools

Internal tooling for Wattle Court that automates Buildertrend admin workflows
including bill creation from extracted invoice data, PO matching, and dashboards.

## Architecture

This is a monorepo containing two deployable services and shared types:

```
apps/
  web/            Next.js 14 (App Router, TypeScript, Tailwind, shadcn/ui)
                  → deploys to Vercel
                  Handles all UI, user auth, dashboards, webhook receiver
  bt-service/     Python FastAPI service (curl-cffi for TLS impersonation)
                  → deploys to Fly.io / Railway / DigitalOcean
                  Handles ALL Buildertrend API calls. Holds BT session.
packages/
  shared-types/   TypeScript types mirroring the Python service contracts
```

## Why two services?

Buildertrend's API requires Chrome's TLS fingerprint to accept connections.
We use `curl-cffi` (Python) for this. Node.js does not have a clean equivalent.

Therefore:
- **Web app** runs on Vercel (great DX, free tier, scales)
- **BT service** runs on a normal VM/container so we can use curl-cffi
- They communicate over HTTPS with a shared internal token

## Getting started

### Prerequisites
- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- Python 3.11+
- Docker (for local dev with the database)

### Local development

```bash
# 1. Install everything
pnpm install
cd apps/bt-service && python -m venv .venv && source .venv/bin/activate
pip install -e .
cd ../..

# 2. Copy env files
cp apps/web/.env.example apps/web/.env.local
cp apps/bt-service/.env.example apps/bt-service/.env

# 3. Start the database (Postgres in Docker)
docker compose up -d

# 4. Run database migrations
pnpm --filter web db:migrate

# 5. In one terminal, run the Python service:
cd apps/bt-service && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# 6. In another terminal, run the web app:
pnpm --filter web dev
```

Web app: http://localhost:3000
BT service: http://localhost:8000 (docs at /docs)

### Deployment

- **Web app:** push to GitHub, connect to Vercel, set env vars. Done.
- **BT service:** see `apps/bt-service/README.md` for Fly.io / Railway / Docker
  deployment instructions.
- **Database:** managed Postgres (Neon recommended for free tier).

## Documentation

- [Architecture decisions](docs/architecture.md)
- [Buildertrend API notes](docs/buildertrend-api.md)
- [Session refresh process](docs/session-refresh.md)
- [Security considerations](docs/security.md)

## Project status

Pre-alpha. Built around reverse-engineered Buildertrend endpoints. Expect
breakage when Buildertrend ships UI updates that change their internal API.

## Maintenance reality check

This tool depends on undocumented Buildertrend API endpoints. They will
change without notice. Budget time for monthly maintenance.
