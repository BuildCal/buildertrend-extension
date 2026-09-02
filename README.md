# Buildertrend Gateway

One door between Wattle Court / ViaBuild and Buildertrend. Humans and agents
do the work **outside** Buildertrend. Buildertrend stays the **system of
record** (the copy the office, owners, and franchise still see).

This repository also contains the older bill-review web app. New callers
(ViaBuild, Grok, Cursor) must use the **gateway verbs**, not scrape
`buildertrend.net` themselves.

> **Unofficial.** Not affiliated with, endorsed by, or supported by Buildertrend.
> Cookie-session access to undocumented internal APIs. Use only against **your
> own** account. Review [Buildertrend’s terms](https://buildertrend.com) before deploying.

## What it is

| Layer | Role |
| --- | --- |
| **Adapter** | Cookie-session HTTP to `buildertrend.net`. Ugly, once. Python `bt-service` impersonates Chrome TLS. |
| **Verbs** | Stable names: `jobs.list`, `invoices.get`, `variations.saveDraft`, … |
| **MCP + HTTP** | One implementation. Agents get MCP tools (`bt_jobs_list`, …). Apps POST `/v1/...`. |

Default every write to **Draft / Not sent**. `BT_GATEWAY_ENABLE_SEND=false`.
Uncaptured writes return `not_captured` plus the UI click needed — we do not guess URLs.

## Apps

```
apps/
  gateway/      TypeScript verbs, MCP, HTTP /v1, GST dummy-line, capture harness
  bt-service/   Python FastAPI + curl-cffi (TLS fingerprint). Session store + generic /internal/bt-request
  web/          Next.js bill review queue (calls the sidecar; should move onto gateway verbs)
```

## Quick start (gateway)

```bash
pnpm install
cp apps/gateway/.env.example apps/gateway/.env
# Set BT_SERVICE_URL + BT_SERVICE_INTERNAL_TOKEN after bt-service is up
# Leave BT_GATEWAY_ENABLE_SEND=false

pnpm --filter gateway test
pnpm --filter gateway mcp      # stdio MCP
pnpm --filter gateway serve    # HTTP :8787
```

Attach a **dedicated gateway Chrome profile** (not a human daily profile). See
[apps/gateway/README.md](apps/gateway/README.md).

Builder id defaults to the observed Wattle Court Mid-Coast tenant **110310**.

## Bill-review web app (existing)

Invoice extraction, PO matching, and a human review queue still live in
`apps/web`. Setup: [docs/getting-started.md](docs/getting-started.md).

## Documentation

| Doc | What’s in it |
| --- | --- |
| [Gateway README](apps/gateway/README.md) | Profile, MCP, HTTP, dry_run, send lock |
| [Slice C captures](docs/slice-c-captures.md) | Remaining writes + exact UI clicks |
| [API map](buildertrend-api-map.md) | Captured routes (no cookies) |
| [Architecture](docs/architecture.md) | Why the split, review queue, audit log |
| [Buildertrend API notes](docs/buildertrend-api.md) | Sidecar-era bill endpoints |
| [Session refresh](docs/session-refresh.md) | Daily cookie-upload ritual |
| [Security](docs/security.md) | Threat model |

## Safety

- No owner email, no `notify-owners`, no invoice Send
- No payments, no Xero pay, no “mark ready for payment” unless flagged
- No new real contact/lead/job without `dry_run=false` **and** sandbox
- Do not store credentials in git, MCP logs, or issue comments
- Change-order GST is a dummy line (1/11 of **owner** price). Do not use the native CO tax engine
- Bades = project expenses only. Never workers comp / icare / tax / payroll through BT
- Team-facing agents must not dump cash/P&L at Eli/Andrew/Bades/Tori

## License

[MIT](LICENSE)
