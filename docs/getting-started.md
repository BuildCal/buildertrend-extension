# Getting started

A step-by-step for the first time you clone this repo.

## 1. Prerequisites

- Node.js 20+ (`node --version`)
- pnpm 9+ (`npm install -g pnpm`)
- Python 3.11+ (`python --version`)
- Docker (for local Postgres)

## 2. Clone & install

```bash
git clone <repo-url> buildertrend-tools
cd buildertrend-tools

# Web app deps
pnpm install

# Python service deps
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

Generate the secrets:

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# INTERNAL_API_TOKEN — must match in BOTH .env files
openssl rand -base64 32

# EXTRACTOR_WEBHOOK_SECRET
openssl rand -base64 32

# SESSION_ENCRYPTION_KEY (Fernet)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Paste each into the corresponding `.env` file. The `INTERNAL_API_TOKEN`
is the only secret that needs to match between the two services.

## 4. Start the database

```bash
docker compose up -d
```

Wait a few seconds, then run the migration:

```bash
pnpm --filter web db:migrate
```

This creates the schema. You'll be prompted to name the migration on
the first run — call it `init`.

## 5. Create the first admin user

```bash
pnpm --filter web exec tsx scripts/seed.ts admin@yourcompany.com
```

It generates a random password and prints it. Save it somewhere
temporary — you'll change it after first login.

## 6. Run both services

In one terminal — the Python service:

```bash
cd apps/bt-service
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

In another — the web app:

```bash
pnpm --filter web dev
```

Visit http://localhost:3000 and sign in.

## 7. Capture your first BT session

1. In Chrome, log into Buildertrend.
2. In BT Tools, navigate to Admin → Refresh Buildertrend session.
3. Use "Get cookies.txt LOCALLY" extension to export buildertrend.net cookies.
4. Upload the file. The status should turn green.

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

Check the bills queue at http://localhost:3000/bills — the test bill
should be there. Click "Review →" to step through approval and post
to BT.

## Deployment (when ready)

- **Web app:** push to GitHub → connect repo to Vercel → set env vars in
  Vercel project settings (matching `.env.example`) → deploy. Add the
  Postgres URL from a managed provider (Neon free tier recommended).
- **bt-service:** see `apps/bt-service/README.md`. Recommended:
  Fly.io with `fly launch`.
- **Webhook:** point your Claude extraction tool at
  `https://your-app.vercel.app/api/webhooks/extracted-bill`.

## Common issues

- **`prisma generate` errors on Vercel build:** confirm `vercel.json`
  has `"buildCommand": "pnpm db:generate && pnpm build"`.
- **bt-service unreachable from Vercel:** make sure your bt-service
  host's URL in `BT_SERVICE_URL` is reachable from Vercel's edge,
  and that any IP allow-listing includes Vercel's egress IPs.
- **TLS impersonation failures:** make sure Python is 3.11+ and
  `curl-cffi` installed cleanly (no compilation errors in `pip install`).
