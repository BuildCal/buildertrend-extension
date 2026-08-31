# Contributing

Thanks for taking a look. This is a small, opinionated tool. Small, well-scoped changes land faster than large refactors.

## Ground rules

1. **Do not commit secrets.** No `.env`, cookie dumps, HAR files, or session JSON. They are gitignored for a reason.
2. **Do not add a generic “call any BT endpoint” helper.** Every Buildertrend capability must be an explicit method on `BTClient`.
3. **Keep the sidecar private.** Features that would encourage exposing `bt-service` to browsers or the public internet will be rejected.
4. **Treat BT responses as untrusted** when they are fed to an LLM (vendor names, descriptions, etc. can carry prompt injection).

## Setup

Follow [docs/getting-started.md](docs/getting-started.md). You should be able to:

- run `pnpm typecheck` and `pnpm lint` in `apps/web`
- run `ruff check app` and `pytest` in `apps/bt-service`

CI runs those same checks on every pull request.

## Branch and PR

1. Fork (or branch from `main` if you have write access).
2. Keep the change focused — one concern per PR.
3. Add or update tests when you change `BTClient` or request/response contracts.
4. Update docs if you change env vars, endpoints, or the session-refresh flow.
5. Fill in the pull request template.

## Code notes

- **Web** (`apps/web`): Next.js App Router, TypeScript strict, Prisma, NextAuth credentials. Server-only modules that hold tokens must stay server-only (`import "server-only"`).
- **Sidecar** (`apps/bt-service`): FastAPI, Pydantic v2, `curl-cffi`. Prefer small, explicit route handlers over a mega-client.
- Payload translation for creating bills lives in `apps/bt-service/app/routes/bills.py` on purpose — keep the messy BT shape out of the web app.

## Reporting bugs

Use GitHub Issues. Include the service (web vs bt-service), what you expected, and what happened. Never paste cookies, tokens, or full HAR files into an issue — redact them.
