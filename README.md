# Buildertrend Extension

Self-hosted tools for Buildertrend bill workflows: invoice extraction, PO matching, a review queue, and dashboards.

> **Unofficial.** This project is not affiliated with, endorsed by, or supported by Buildertrend. It talks to undocumented internal APIs that can change without notice. Use it only against **your own** Buildertrend account, and review [Buildertrend’s terms of service](https://buildertrend.com) before deploying.

## What it does

- Capture a logged-in Buildertrend session (cookie upload) so the sidecar can call BT as you
- Mirror jobs, vendors, cost codes, POs, and bills into Postgres
- Accept extracted invoices via webhook (or upload PDFs and extract with Claude)
- Match invoices to vendors, jobs, and purchase orders
- Require human review before posting a bill back to Buildertrend
- Append-only audit log of every mutating action

## Architecture

Two services, one database:

```
apps/
  web/          Next.js 14 (App Router, TypeScript, Tailwind)
                UI, auth, dashboards, webhook receiver
                typically deployed to Vercel
  bt-service/   Python FastAPI + curl-cffi (Chrome TLS impersonation)
                All Buildertrend HTTP calls and session storage
                typically deployed to Fly.io / Railway / a VM
```

Buildertrend’s edge rejects connections that do not look like Chrome. `curl-cffi` handles TLS fingerprint impersonation; there is no mature Node equivalent, which is why the sidecar is Python.

The two services talk over HTTPS with a shared `INTERNAL_API_TOKEN`. The sidecar must **not** be public — put it on a private network, tunnel, or IP allow-list.

## Status

Pre-alpha. Expect breakage when Buildertrend ships UI or API changes. Budget time for ongoing maintenance.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.11+
- Docker (local Postgres)

## Quick start

```bash
git clone https://github.com/BuildCal/buildertrend-extension.git
cd buildertrend-extension

pnpm install

cd apps/bt-service
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cd ../..

cp apps/web/.env.example apps/web/.env.local
cp apps/bt-service/.env.example apps/bt-service/.env
# Generate secrets — see docs/getting-started.md

docker compose up -d
pnpm db:migrate
pnpm db:seed -- admin@yourcompany.com

# terminal 1
cd apps/bt-service && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# terminal 2
pnpm dev
```

- Web app: http://localhost:3000
- BT service: http://localhost:8000 (OpenAPI at `/docs` in development)

Full walkthrough, including session capture and a smoke-test webhook: [docs/getting-started.md](docs/getting-started.md).

## Documentation

| Doc | What’s in it |
| --- | --- |
| [Getting started](docs/getting-started.md) | Clone, env, first admin, first BT session |
| [Architecture](docs/architecture.md) | Why the split, review queue, audit log |
| [Buildertrend API notes](docs/buildertrend-api.md) | Reverse-engineered endpoints (unofficial) |
| [Session refresh](docs/session-refresh.md) | Daily cookie-upload ritual |
| [Security](docs/security.md) | Threat model, secret rotation, incident notes |
| [bt-service README](apps/bt-service/README.md) | Sidecar run / deploy |

## Configuration

Every secret is environment-driven. Copy the example files and generate your own values — never commit `.env`, cookie dumps, or HAR captures (already gitignored).

Required for a minimal local run:

- `DATABASE_URL` / `DIRECT_URL` — Postgres
- `NEXTAUTH_SECRET` — session signing
- `INTERNAL_API_TOKEN` / `BT_SERVICE_INTERNAL_TOKEN` — shared sidecar token
- `SESSION_ENCRYPTION_KEY` — Fernet key for BT cookies at rest
- `BT_BUILDER_ID` — your Buildertrend builder / tenant id
- `EXTRACTOR_WEBHOOK_SECRET` — inbound webhook auth

Optional (invoice PDF upload + Claude extraction):

- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`

## Security

This tool holds a live Buildertrend session. Treat it like production credentials.

- Do not expose `bt-service` to the public internet
- Do not log cookies, the internal token, or the webhook secret
- Rotate secrets if a laptop is lost or a teammate leaves
- Report vulnerabilities privately — see [SECURITY.md](SECURITY.md)

## License

[MIT](LICENSE)

Buildertrend is a trademark of its respective owner. This repository is an independent integration.
