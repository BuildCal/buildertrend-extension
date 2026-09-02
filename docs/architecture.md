# Architecture decisions

This document captures the why behind the structural choices. Read when
you're tempted to refactor.

## 0. One gateway (TypeScript verbs)

**Decision:** All Buildertrend reads and writes go through `apps/gateway`.
MCP tools and HTTP `/v1` are the same verbs. ViaBuild, Xero helpers, Clarum,
and agents must not each scrape Buildertrend.

**Why:** If Buildertrend changes a URL, only the adapter changes. The office
still sees BT as the system of record; we operate outside it.

**Consequence:** Uncaptured writes return `not_captured` instead of a guessed
POST. Send/pay/notify tools exist only behind `BT_GATEWAY_ENABLE_SEND=false`.
HTTP `/v1` fails closed without `BT_GATEWAY_TOKEN`. The gateway runtime store
is `apps/gateway/src/store.ts`; Prisma in `apps/web` is the migration schema
for the same tables (jobs / POs / bills plus leads / contacts / invoices /
variations / sync_state / command_log).

## 1. Two-service split (Next.js + Python)

**Decision:** The web app is Next.js on Vercel. All Buildertrend API calls
go through a separate Python FastAPI service.

**Why:** Buildertrend's edge layer rejects connections that don't have a
Chrome-like TLS handshake. Tests during development showed that
`requests` (Python) and the Node.js standard library both fail.
`curl-cffi` (Python) succeeds via TLS fingerprint impersonation. There is
no mature Node.js equivalent at the time of writing.

**Consequence:** The bt-service must be deployed somewhere that supports
native binaries (Fly.io, Railway, a VM) — not Vercel's Python serverless
runtime, which has a constrained environment and shouldn't be relied on
for our use case.

## 2. Session lifecycle: human-in-the-loop refresh

**Decision:** The BT session is captured manually each morning by an admin
exporting Chrome cookies and uploading them via the admin UI.

**Why:** Automating a Buildertrend login means automating Auth0 OAuth +
MFA + Salesforce SSO redirects. Doable with Playwright, but adds a class
of failures (selector changes, MFA prompts, captchas) that cost more to
maintain than the daily 30-second manual ritual.

**Future:** When session lifetime is well understood and we trust the
flow, we can switch to a Playwright-driven nightly refresh that runs on
the bt-service host.

## 3. Bill review queue (mandatory human review for v1)

**Decision:** Every extracted bill goes into a review queue. A team member
must approve before it posts to BT.

**Why:** The extraction stage (Claude on PDFs) will be ~95% accurate. The
remaining 5% will create accounting cleanup work that's expensive to fix.
20 bills/week × 15 seconds review = 5 minutes/week of human time. Cheap
insurance.

**Future:** Once the mapping logic has been validated on hundreds of real
bills, we can add a "high-confidence auto-post" path for the obviously
correct ones. Low-confidence extractions still go through review.

## 4. Idempotency on `source_extraction_id`

**Decision:** Every bill that arrives via webhook is keyed on
`source_extraction_id` (a stable identifier from the extractor). Duplicate
webhooks return the existing record rather than create duplicates.

**Why:** Webhooks retry. Browser tabs get left open. Network glitches
happen. Without idempotency we'd post duplicate bills to BT, which is
expensive to clean up.

## 5. Audit log is append-only

**Decision:** Every action that touches BT is logged before AND after.
The audit log is never edited or deleted.

**Why:** Bills feed accounting. When (not if) something looks wrong in
six months, we need to reconstruct exactly what happened, when, and at
whose instruction.

## 6. shadcn/ui rather than a component library

**Decision:** Components live in our own repo (copy-paste from shadcn)
rather than importing from a packaged library.

**Why:** This app is expected to live for years. Shipping our own UI
primitives means we never have a "library X is now deprecated" upgrade
scramble. The cost is one-time at project start.
