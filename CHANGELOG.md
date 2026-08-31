# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project does not yet follow SemVer releases (pre-alpha).

## [Unreleased]

### Added

- MIT license, contributing guide, code of conduct, and security policy
- GitHub issue and pull request templates
- Complete environment variable examples (including optional Claude / Supabase)
- Admin seed script wired as `pnpm db:seed`

### Changed

- README rewritten for a public, self-hosted audience (unofficial Buildertrend disclaimer)
- Removed tenant-specific branding and hardcoded builder IDs from examples
- Webhook authentication now uses a timing-safe comparison and fails closed if the secret is unset
- Invalid bill list `status` query params now return HTTP 400 instead of crashing (name clash with FastAPI `status`)
- Anthropic and Supabase clients initialize lazily so the app can boot without optional keys
- `bt-service` uses a FastAPI lifespan hook instead of the deprecated `on_event` startup handler
- Docker image for `bt-service` runs as a non-root user and includes a health check

### Removed

- Unused Python dependencies (`alembic`, `python-jose`) that were not referenced in code
- Empty `packages/*` workspace glob (shared types live in the web app)
