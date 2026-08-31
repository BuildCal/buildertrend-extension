# Security considerations

This is a self-hosted tool that holds privileged Buildertrend access for your
team. Treat a running instance as production.

This project is unofficial and not affiliated with Buildertrend. You are
responsible for how you use it against your own account.

## Threat model

What we are protecting:

- Captured BT session cookies (equivalent to an admin session until expiry)
- The webhook secret (anyone with it can inject bills into the queue)
- The internal API token (anyone with it can call `bt-service` directly)
- The audit log (must remain intact for accountability)

Realistic threats:

- Compromised laptop / leaked secrets
- Malicious bill data via the webhook (prompt injection in vendor names)
- Bugs that drop the audit trail

## Hard rules

### NEVER

- Log cookie values, the internal token, or the webhook secret.
- Store cookies unencrypted in the database. `bt-service` encrypts at rest
  with `SESSION_ENCRYPTION_KEY`.
- Expose `bt-service` publicly. Put it behind a VM firewall, a Fly private
  network, Cloudflare Tunnel, or similar.
- Commit `.env`, `bt_cookies.txt`, `*.har`, or `session.json`. Already in
  `.gitignore`.
- Build a "run arbitrary BT API call" tool — every capability must be
  explicit in `bt_client.py`.

### ALWAYS

- Audit-log every BT-mutating action with userId, action, resourceId, and
  detail — before and after the call.
- Use idempotency keys on create operations (`source_extraction_id`).
- Validate inputs with Zod (web) / Pydantic (service).
- Treat BT data read back (vendor names, bill descriptions) as untrusted
  when feeding it to LLMs.

## Secret rotation

- **NEXTAUTH_SECRET, INTERNAL_API_TOKEN, EXTRACTOR_WEBHOOK_SECRET:**
  rotate annually, or immediately if a developer leaves or a laptop is
  suspected lost. Coordinate both Vercel env vars and sidecar secrets.
- **SESSION_ENCRYPTION_KEY:** rotate carefully — re-encrypting stored
  sessions requires both old and new keys briefly.
- **BT credentials (the user whose session is captured):**
  rotate when that user changes role or leaves the company.

## When things go wrong

### Someone leaked the webhook secret

1. Generate a new value: `openssl rand -base64 32`
2. Update `EXTRACTOR_WEBHOOK_SECRET` in the web app's env
3. Update the secret in the extractor
4. Redeploy. The existing bill queue is unaffected — the secret is only
   checked on incoming webhooks.

### BT bills were created that nobody approved

1. Start with the audit log.
2. If an attacker has the sidecar token: rotate `INTERNAL_API_TOKEN`,
   restart `bt-service`, update the web app env.
3. If the BT session was used directly: sign that BT user out of all
   devices from Buildertrend.

### A laptop with `.env` was stolen

1. Rotate **all** secrets immediately (`NEXTAUTH_SECRET`,
   `INTERNAL_API_TOKEN`, `EXTRACTOR_WEBHOOK_SECRET`, database password,
   the BT user's password, Anthropic / Supabase keys if used).
2. Force-log-out the captured BT session in Buildertrend.
3. Audit recent BT activity for unexpected actions.

## Why we do not store BT passwords

We never hold your Buildertrend password — only short-lived session
cookies. That is intentional. Even with application secrets compromised,
an attacker gets at most one BT session of access, after which Buildertrend
requires a real interactive login (with MFA) again.
