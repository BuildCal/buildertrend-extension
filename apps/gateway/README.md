# Buildertrend Gateway

One door between Wattle Court / ViaBuild systems and Buildertrend.

Humans and agents work **outside** Buildertrend. This gateway is the only
process that speaks `buildertrend.net`. Buildertrend stays the **system of
record** after a successful push. Default every write to **Draft / Not sent**.

```
ViaBuild / Xero / Clarum / Grok / Cursor
                 │
                 ▼
        Buildertrend Gateway     ← verbs (jobs.list, variations.saveDraft, …)
         MCP tools + HTTP /v1
                 │
                 ▼
        Adapter (cookie session)
         sidecar TLS (curl-cffi)  or  direct cookie jar
                 │
                 ▼
           buildertrend.net
```

Do **not** start a second MCP per app. Call these verbs.

## Safety (non-negotiable)

| Lock | Default |
| --- | --- |
| `BT_GATEWAY_ENABLE_SEND` | `false` — no owner email, no `notify-owners`, no invoice Send, no pay, no mark-ready-for-payment, no convert-to-job, no send-to-budget |
| `dry_run` on writes | `true` until the caller sets `dry_run=false` |
| New job / lead / contact | also needs `BT_GATEWAY_SANDBOX=true` |
| GST on change orders | dummy line **4000 GST** (`costCode` **17072421**), 1/11 of **owner** price |
| Owner-invoice GST | tax group **78952** (not the CO dummy-line pattern) |
| Secrets | never log `Cookie`, `Authorization`, or login HTML |

On `needsToRelogin: true` or 401 the gateway **stops writes** and returns `auth_required`. It does not loop logins.

## Attach a signed-in profile

**Dedicated gateway Chrome profile / cookie jar only.** Never the human Wattle Court tab. Session clash already ate saves when both drove the same Chrome profile.

The capture harness **fails closed** unless the profile path contains `bt-gateway` or `gateway-profile`, or the directory has a `.bt-gateway-profile` marker. It also refuses `BT_GATEWAY_HUMAN_PROFILE` if that path is passed as `--profile`.

1. Sign into `https://buildertrend.net` in that profile.
2. Export cookies to a JSON jar **or** let the existing `bt-service` session upload store them encrypted.
3. Point the gateway at the sidecar (recommended — Chrome TLS fingerprint) or at the jar.

```bash
# Sidecar (preferred)
BT_TRANSPORT=sidecar
BT_SERVICE_URL=http://127.0.0.1:8000
BT_SERVICE_INTERNAL_TOKEN=...
BT_BUILDER_ID=110310
BT_GATEWAY_ENABLE_SEND=false

# Direct (tests / capture). Never commit the jar.
BT_TRANSPORT=direct
BT_COOKIE_JAR=/var/lib/bt-gateway/cookies.json
BT_GATEWAY_PROFILE=/var/lib/bt-gateway/chrome-profile
```

Cookie jar shape (either Chrome export list or name → `{ value, domain, path }`).

## Run

```bash
pnpm --filter gateway test
pnpm --filter gateway mcp      # stdio MCP for Cursor / Grok
pnpm --filter gateway serve    # HTTP :8787
```

HTTP **requires** `BT_GATEWAY_TOKEN`. Unset or empty token → 401 on every `/v1` route (health stays open). Stdio MCP is local-only.

HTTP (ViaBuild and other apps — same verbs):

```http
POST /v1/invoke
X-BT-Gateway-Token: $BT_GATEWAY_TOKEN
{ "verb": "jobs.list", "args": { "search": "Kolodong" } }

POST /v1/variations/add-lines
{ "changeOrderId": 123, "dry_run": true, "lines": [ ... ] }
```

MCP tool names: `bt_jobs_list`, `bt_invoices_get`, `bt_variations_save_draft`, …

## Errors

`auth_required` · `not_captured` · `send_disabled` · `duplicate_invoice_id` · `tax_engine_unusable` · `conflict` · `sandbox_required`

Uncaptured writes return `not_captured` plus the UI click needed to capture them. See [docs/slice-c-captures.md](../../docs/slice-c-captures.md).

## Capture harness

```bash
pnpm --filter gateway capture -- \
  --url https://buildertrend.net/app/OwnerInvoices \
  --profile /var/lib/bt-gateway/chrome-profile
```

Perform **one** draft save. The harness records method, path, content-type, and JSON keys (cookies stripped) and appends `buildertrend-api-map.md`. Then implement the verb, replay `dry_run`, then one real draft, GET to verify, leave **Not sent**.
