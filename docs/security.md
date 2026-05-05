# Security considerations

This is an internal tool that holds privileged Buildertrend access for
your whole team. Treat it accordingly.

## Threat model

The things we're protecting:
- The captured BT session cookies (equivalent to admin password until expiry)
- The webhook secret (anyone with it can inject bills into the queue)
- The internal API token (anyone with it can call bt-service directly)
- The audit log (must remain intact for accountability)

The realistic threats:
- Compromised employee laptop / leaked secrets
- Malicious bill data via the webhook (prompt injection in vendor names)
- Bugs in our code that lose the audit trail

## Hard rules

### NEVER

- Log cookie values, the internal token, or the webhook secret.
- Store cookies unencrypted in the database. The `bt-service` is
  responsible for encrypting at rest using `SESSION_ENCRYPTION_KEY`.
- Expose `bt-service` publicly. It must sit behind a VM firewall, a
  Fly private network, Cloudflare Tunnel, or similar.
- Commit `.env`, `bt_cookies.txt`, `*.har`, or `session.json` to git.
  Already in `.gitignore`.
- Build a "run arbitrary BT API call" tool — every capability must be
  explicit in `bt_client.py`.

### ALWAYS

- Audit log every BT-mutating action with userId, action, resourceId,
  and detail. Before AND after the call.
- Use idempotency keys on all create operations.
- Validate all inputs with Zod (web) / Pydantic (service).
- Treat BT data read-back (vendor names, bill descriptions, etc.) as
  untrusted when feeding it to LLMs. Could contain prompt injection.

## Secret rotation

- **NEXTAUTH_SECRET, INTERNAL_API_TOKEN, EXTRACTOR_WEBHOOK_SECRET:**
  rotate annually, or immediately if a developer leaves or a laptop
  is suspected lost. Coordinate with both Vercel env vars and Fly
  secrets.
- **SESSION_ENCRYPTION_KEY:** rotate carefully — re-encrypting stored
  sessions requires both old and new keys briefly. Implement before
  needed.
- **BT credentials (the user account whose session is captured):**
  rotate when that user changes role / leaves the company.

## When things go wrong

### "Someone leaked the webhook secret"

1. Generate a new value: `openssl rand -base64 32`
2. Update `EXTRACTOR_WEBHOOK_SECRET` in Vercel env vars
3. Update the secret in your extractor's config
4. Vercel will redeploy. Existing bill queue is unaffected — the secret
   is only checked on incoming webhooks.

### "BT bills got created that we didn't approve"

1. The audit log shows every action. Start there.
2. If a real attacker has the bt-service token: rotate
   `INTERNAL_API_TOKEN`, restart bt-service, update Vercel env vars.
3. If the BT session was used directly: the captured user can log in
   to BT and click "Sign out of all devices."

### "Our laptop with .env was stolen"

1. Rotate ALL secrets immediately (NEXTAUTH_SECRET, INTERNAL_API_TOKEN,
   EXTRACTOR_WEBHOOK_SECRET, DATABASE_URL password, the BT user's password).
2. Force log out the captured BT session in BT itself.
3. Audit recent BT activity for unexpected actions.

## Why we don't store BT credentials directly

We never have your BT password — only short-lived session cookies.
That is intentional. Even with all our secrets compromised, the attacker
gets at most one BT session worth of access, after which BT will require
a real interactive login (with MFA) again.
