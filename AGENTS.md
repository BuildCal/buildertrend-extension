# AGENTS.md — read this first

If a user pasted [https://github.com/BuildCal/buildertrend-gateway](https://github.com/BuildCal/buildertrend-gateway)
(or the old URL [https://github.com/BuildCal/buildertrend-extension](https://github.com/BuildCal/buildertrend-extension),
which redirects) into **Grok Bot** or any coding agent, **read this file
before you do anything else**.

You are installing the **Buildertrend Gateway** on **Grok Bot’s computer**
and attaching it as a **local stdio MCP**. There is **no** catalog connector
named Buildertrend.

Human-facing steps: [docs/GROK_BOT_SETUP.md](docs/GROK_BOT_SETUP.md).
Gateway internals: [apps/gateway/README.md](apps/gateway/README.md).

**Unofficial.** Not affiliated with Buildertrend. Own account only. Never
commit cookies, tokens, or HAR files. Never log `Cookie`, `Authorization`,
or login HTML.

## Facts about Grok Bot (do not invent UI)

- Settings: sidebar **account button, bottom-left**, or **Cmd+,**.
  Tabs: **General**, **Computer**, **Usage & Billing**, **Updates**.
  Do not mention a gear icon or macOS Preferences.
- Per-agent info pane: click the **agent name in the chat header**, or
  **Cmd+Shift+I**.
- Add the gateway with **AddMcpServer** (command + args + env) after the
  user agrees on a **question widget**. There is no `cwd` field — use an
  **absolute** `--dir`.
- The MCP `command` server runs on **Grok Bot’s computer** and also in
  **this user’s other agents**. Say that when you confirm.
- After AddMcpServer, new tools appear on the **next** message, not the
  same one.
- Buildertrend login that needs a human (password, 2FA): hand them the box
  with **request_box_help** and the text `Sign in to buildertrend.net`.
  Never ask them to paste a password into chat. Never type their password.
- Dedicated Chrome profile only. Path must contain `bt-gateway` or
  `gateway-profile`, or the directory must have a `.bt-gateway-profile`
  marker. Never the human daily Buildertrend tab.

## What you will set up

| Piece | Role |
| --- | --- |
| `apps/gateway` | Stable verbs, stdio MCP, HTTP `/v1` |
| `apps/bt-service` | Cookie-session adapter (Chrome TLS). Preferred transport. |
| Local MCP | `pnpm --filter gateway mcp` via AddMcpServer |

Scripts (you run these, not the user):

```text
pnpm --filter gateway mcp      # stdio MCP
pnpm --filter gateway serve    # HTTP :8787
pnpm --filter gateway test
```

Locks you must keep:

- `BT_GATEWAY_ENABLE_SEND=false` always in setup
- Writes default to `dry_run`
- HTTP `/v1` requires `BT_GATEWAY_TOKEN` (fail closed). Stdio MCP is local-only
- Do not enable send. Do not merge PRs. Do not touch live Buildertrend except
  through this gateway after the user has signed in

`BT_BUILDER_ID` default **110310** is **Wattle Court Mid-Coast only**. Other
users get builder id from `session.status` / GlobalInfo after login. Do not
hard-code 110310 for a different tenant.

## Playbook

### 1. Fetch this repo yourself

Work on **Grok Bot’s computer**. Do **not** tell the user to clone, install
Node, or run terminal commands.

Use the canonical URL:

`https://github.com/BuildCal/buildertrend-gateway`

(The old `buildertrend-extension` URL redirects.)

### 2. One short message

Tell the user you will:

1. Install the gateway on **your** computer
2. Connect it as a local connector
3. Ask them to sign into Buildertrend **once**, on a screen you show them

Do not dump a command list.

### 3. Confirm before you change their account

Use a **question widget** before **AddMcpServer** (that is an account
change). Confirm they have a Buildertrend login they are allowed to use.

When you confirm, say clearly that this connector runs on **Grok Bot’s
computer** and also for **their other agents**.

If they say no, stop. Do not add the server.

### 4. Install toolchain and dependencies

On Grok Bot’s computer, if missing: **Node 20+** and **pnpm 9+**.
Then at the repo root:

```bash
pnpm install
```

Gateway package engine is Node `>=20`. Workspace `packageManager` is
`pnpm@9.0.0`.

### 5. Write `apps/gateway/.env` from the example

```bash
cp apps/gateway/.env.example apps/gateway/.env
```

Generate secrets (do not commit `.env`):

```bash
openssl rand -base64 32   # BT_GATEWAY_TOKEN
openssl rand -base64 32   # BT_SERVICE_INTERNAL_TOKEN
```

Force:

```dotenv
BT_GATEWAY_ENABLE_SEND=false
BT_TRANSPORT=sidecar
BT_SERVICE_URL=http://127.0.0.1:8000
BT_SERVICE_INTERNAL_TOKEN=<same value you generated>
```

Sidecar transport is preferred. Leave `BT_BUILDER_ID` unset or placeholder
until GlobalInfo returns the real id. Do not copy 110310 onto another
builder.

HTTP `/v1` fails closed without `BT_GATEWAY_TOKEN`. You still generate it
so `pnpm --filter gateway serve` can work later. Stdio MCP does not use
that token.

### 6. Start `apps/bt-service` and keep it running

Point the gateway at it (`BT_SERVICE_URL` + matching internal token).

```bash
cp apps/bt-service/.env.example apps/bt-service/.env
```

Set `INTERNAL_API_TOKEN` to the **same** value as
`BT_SERVICE_INTERNAL_TOKEN`. Generate `SESSION_ENCRYPTION_KEY` (Fernet).
Keep `BT_GATEWAY_ENABLE_SEND=false`.

```bash
cd apps/bt-service
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

Sidecar session store expects Postgres + `DATABASE_URL` (see
`docker-compose.yml` and `apps/bt-service/.env.example`). The gateway
itself can run without `DATABASE_URL` (in-memory store). **Do not** “fix”
Prisma / `PostgresStore` / sidecar blockers in a setup pass. If the sidecar
cannot persist a session, keep the sidecar for TLS if it is up, and persist
cookies from the **dedicated** profile into the sidecar
`POST /sessions/refresh` (internal token) or, last resort, a JSON jar +
`BT_TRANSPORT=direct`. Never commit the jar.

### 7. Dedicated gateway Chrome profile

Create or reuse a profile whose path contains `bt-gateway` or
`gateway-profile`, or create the directory and add a `.bt-gateway-profile`
marker file.

**Fail closed** if the path looks like a human daily profile (for example
the default Chrome user-data dir, or anything passed as
`BT_GATEWAY_HUMAN_PROFILE`). Session clash already ate saves when a human
tab and the gateway shared one profile.

Never dual-drive their everyday Buildertrend tab.

### 8. Buildertrend sign-in / 2FA

When a human must type a password or 2FA:

1. Hand them the box with **request_box_help** and the text
   `Sign in to buildertrend.net`
2. Wait. Resume after they finish
3. Persist the session (sidecar `/sessions/refresh` or dedicated-profile
   jar). **Never log cookies**
4. If you get `auth_required` later, show the box **once** more. Do **not**
   loop logins

Never ask them to paste a password, cookies, or 2FA into chat. Never type
their password.

### 9. AddMcpServer

Name: `buildertrend-gateway`.

AddMcpServer has **no `cwd`**. Use an **absolute** path to this checkout.

Example:

- **command:** `pnpm`
- **args:** `["--dir", "<absolute-path-to-this-repo>", "--filter", "gateway", "mcp"]`
- **env** (from the `.env` you wrote; do not hard-code 110310 for other
  tenants):

  - `BT_TRANSPORT=sidecar`
  - `BT_SERVICE_URL=http://127.0.0.1:8000`
  - `BT_SERVICE_INTERNAL_TOKEN=<same as sidecar>`
  - `BT_GATEWAY_ENABLE_SEND=false`
  - `BT_BUILDER_ID=<from GlobalInfo after login, if known>`

Say again: this connector runs on Grok Bot’s computer **and** for their
other agents.

Only call AddMcpServer after the question-widget Yes.

### 10. Next message: prove it

New tools appear on the **next** message. On that turn, call a cheap read:

- `bt_session_status` (`session.status`) — preferred; also gives builder id
  from GlobalInfo
- or `bt_jobs_list` / `jobs.list` (read; dry_run is for writes)

If `auth_required`, hand them the sign-in box again. Do not loop.

Do not scrape `buildertrend.net` yourself. Only this gateway.

### 11. Explain how they work now

In plain language:

- They work in **Grok Bot** / ViaBuild
- Buildertrend is the **record** after a draft push
- Send / pay / notify stay **locked** (`BT_GATEWAY_ENABLE_SEND=false`)
- Writes default to **dry_run**; a real draft needs an explicit
  `dry_run=false`
- Uncaptured writes return `not_captured` — do not guess URLs
- They can ask “list my jobs” or “get variation X”

### 12. Hard locks (do not “help” past these)

- Never scrape `buildertrend.net` outside this gateway
- Never dual-drive their daily Buildertrend tab
- Never enable send
- Never merge pull requests (Brad merges)
- Never commit `.env`, cookie jars, tokens, or HAR files
- Never invent a catalog “Buildertrend” connector

## Success

A non-technical user who **only pasted the GitHub URL** can **list jobs**
through Grok Bot **without opening a terminal**.
