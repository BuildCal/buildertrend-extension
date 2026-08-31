# Getting started

First-time setup after cloning this repository.

## 1. Prerequisites

- Node.js 20+ (`node --version`)
- pnpm 9+ (`npm install -g pnpm`)
- Python 3.11+ (`python --version`)
- Docker (for local Postgres)

## 2. Clone and install

```bash
git clone https://github.com/BuildCal/buildertrend-extension.git
cd buildertrend-extension

pnpm install

cd apps/bt-service
python -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cd ../..
```

## 3. Configure environment

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/bt-service/.env.example apps/bt-service/.env
```

Generate secrets and paste them into the corresponding files:

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# INTERNAL_API_TOKEN — must match in BOTH env files
# (web: BT_SERVICE_INTERNAL_TOKEN, sidecar: INTERNAL_API_TOKEN)
openssl rand -base64 32

# EXTRACTOR_WEBHOOK_SECRET
openssl rand -base64 32

# SESSION_ENCRYPTION_KEY (Fernet)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

`INTERNAL_API_TOKEN` is the only secret that must match between the two services.

Set `BT_BUILDER_ID` in `apps/bt-service/.env` to **your** Buildertrend builder / tenant id (visible in BT URLs and some API responses). Leave the example placeholder if you are only exploring the UI.

Invoice PDF upload and Claude extraction are optional. If you skip those env vars, the rest of the app still runs; upload/extract routes will return a configuration error until you add them.

## 4. Start the database

```bash
docker compose up -d
```

Wait a few seconds, then migrate:

```bash
pnpm db:migrate
```

On the first run Prisma may ask you to name a migration if the schema has drifted. Existing migrations in `apps/web/prisma/migrations` should apply as-is.

For local Docker Postgres, `DIRECT_URL` can be the same value as `DATABASE_URL`. Hosted providers that use a pooler (Neon, Supabase) need a direct (non-pooled) URL in `DIRECT_URL`.

## 5. Create the first admin user

```bash
pnpm db:seed -- admin@yourcompany.com
```

It generates a random password and prints it. Change it after first login.

## 6. Run both services

Terminal 1 — Python sidecar:

```bash
cd apps/bt-service
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Terminal 2 — web app:

```bash
pnpm dev
```

Visit http://localhost:3000 and sign in.

## 7. Capture your first Buildertrend session

1. In Chrome, log into Buildertrend as the account you want the tool to act as.
2. In this app, open **Admin → BT Session**.
3. Use the [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) extension to export `buildertrend.net` cookies.
4. Upload the file. Status should turn green after the sidecar verifies the session.

## 8. Send a test bill via webhook

```bash
curl -X POST http://localhost:3000/api/webhooks/extracted-bill \
  -H "Authorization: Bearer $EXTRACTOR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "source_extraction_id": "test-1",
    "vendor_name": "AAA Test Sub Vendor",
    "job_reference": "AAA Test Job",
    "invoice_number": "TEST-001",
    "invoice_date": "2026-05-05T00:00:00Z",
    "amount_total": 250.00,
    "raw": {"note": "smoke test"}
  }'
```

Open http://localhost:3000/bills — the test bill should be in the review queue.

## Deployment

- **Web app:** connect the repo to Vercel, set env vars from `apps/web/.env.example`, and point `DATABASE_URL` / `DIRECT_URL` at managed Postgres (Neon works on the free tier).
- **bt-service:** see `apps/bt-service/README.md`. Fly.io is a good default. Keep it off the public internet.
- **Webhook:** point your extractor at `https://<your-app>/api/webhooks/extracted-bill`.

## Common issues

- **`prisma generate` errors on Vercel:** `apps/web/vercel.json` already runs `pnpm db:generate && pnpm build`. Confirm `DATABASE_URL` and `DIRECT_URL` are set in the Vercel project.
- **bt-service unreachable from Vercel:** `BT_SERVICE_URL` must be reachable from Vercel’s egress, and any IP allow-list must include those IPs (or use a tunnel).
- **TLS impersonation failures:** Python 3.11+ and a clean `curl-cffi` install (no compile errors during `pip install`).
- **`BT_BUILDER_ID` wrong:** sync writes jobs/vendors/bills under that id. If mirrors look empty, the id is usually wrong.
