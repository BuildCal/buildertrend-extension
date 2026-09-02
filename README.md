# Buildertrend Gateway

Unofficial MCP + HTTP gateway for Buildertrend. Humans and agents do the
work **outside** Buildertrend. Buildertrend stays the **system of record**
(the copy the office still sees).

This repository also contains the older bill-review web app. New callers
(your app, Grok, Cursor) must use the **gateway verbs**, not scrape
`buildertrend.net` themselves.

> **Unofficial.** Not affiliated with, endorsed by, or supported by Buildertrend.
> Cookie-session access to undocumented internal APIs. Use only against **your
> own** account. Review [Buildertrend’s terms](https://buildertrend.com) before deploying.

## Use with Grok Bot

If you are not technical, you do not need to clone this repo or open a terminal.
Open **Grok Bot**, paste the prompt below, and let the agent install the gateway
on **its** computer. There is no catalog connector named Buildertrend — the agent
adds a **local** connector after you tap Yes.

```
Set up the Buildertrend Gateway from this GitHub repo. I'm not technical. Follow AGENTS.md and docs/GROK_BOT_SETUP.md. Walk me through it. Don't enable send.

https://github.com/BuildCal/buildertrend-gateway
```

The old address [https://github.com/BuildCal/buildertrend-extension](https://github.com/BuildCal/buildertrend-extension) still redirects here.

When Grok Bot asks to add the Buildertrend Gateway connector, tap **Yes**. When
it shows a Buildertrend sign-in screen, sign in there with a login you are
allowed to use — do not paste your password into the chat. Writes stay drafts.
Send and pay stay off.

Full walkthrough for humans: [docs/GROK_BOT_SETUP.md](docs/GROK_BOT_SETUP.md).
Playbook for the agent (read this first if you were only handed the GitHub URL):
[AGENTS.md](AGENTS.md).

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

Builder id comes from `session.status` / GlobalInfo after login. Do not
hard-code a tenant id.

## Bill-review web app (existing)

Invoice extraction, PO matching, and a human review queue still live in
`apps/web`. Setup: [docs/getting-started.md](docs/getting-started.md).

## Documentation

| Doc | What’s in it |
| --- | --- |
| [Use with Grok Bot](docs/GROK_BOT_SETUP.md) | Human setup — paste the URL, tap Yes, sign in |
| [AGENTS.md](AGENTS.md) | Agent playbook when someone pastes this repo URL |
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
- Change-order GST is a dummy line (1/11 of **owner** price), resolved via Search (`4000 GST`). Do not use the native CO tax engine
- Project expenses only through bills/POs. Never workers comp / tax / payroll through BT

## License

[MIT](LICENSE)
