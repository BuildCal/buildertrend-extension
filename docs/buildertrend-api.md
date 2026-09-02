# Buildertrend API notes

Unofficial notes from reverse-engineering Buildertrend’s internal HTTP API.
This is **not** a public or supported API. Endpoints change without notice.
Update this file when you discover new ones or when BT changes existing ones.

## Base URLs

- Standard endpoints: `https://buildertrend.net/api/...`
- v2 endpoints:        `https://buildertrend.net/apix/v2/...`

## Authentication

- Cookie-based session. Critical cookies are `HttpOnly`:
  - `.AspNet.Auth0` — Auth0-issued auth cookie (large, ~2.8KB)
  - `ASP.NET_SessionId` — server session
  - `__AntiXsrfToken` — anti-CSRF token (cookie, NOT echoed in headers)
  - `GAESA` — Google App Engine session affinity

- **TLS fingerprint check.** Connections must look like Chrome. Plain
  Python `requests` is rejected with a 302 to `/app/error`. Use
  `curl-cffi` with `impersonate="chrome"`.

## Required headers

The minimum that worked from a captured browser session:

- `user-agent: Mozilla/5.0 ... Chrome/147.0.0.0 Safari/537.36`
- `content-type: application/json`
- `portaltype: 1`  (1 = builder portal)
- `referer: https://buildertrend.net/app/Landing`
- `accept: */*`
- `sec-fetch-mode: cors`, `sec-fetch-site: same-origin`, etc.

No anti-CSRF header is required despite the cookie existing.

## Standard response envelope

`/api/...` endpoints return:

```json
{
  "success": true,
  "message": "",
  "needsToRelogin": false,
  "sessionJobInfo": null,
  "data": { ... },
  "metadata": {},
  "forcedUpgrade": null
}
```

`/apix/v2/...` endpoints often return data at the top level instead:

```json
{ "costCodesWithBudget": [ ... ] }
```

`needsToRelogin: true` is the canonical "session expired" signal.

## Endpoints we use

### Sanity check
- `GET /api/AccountInfo/GlobalInfo` — cheapest call to verify auth.

### Bill creation flow
- `GET /api/v1/bills/defaultinfo?jobId={jobId}&isBillRemainingAction=false`
  - Returns vendor list (under `data.assignedTo.options[group=Subs/Vendors]`),
    default field values, validators.
- `GET /apix/v2/JobCostingBudget/budget-cost-codes?jobId={jobId}`
  - Cost codes available for this job (may be empty for jobs without budgets).
- `GET /apix/v2/Bills/get-available-purchase-orders/{vendorId}/{vendorType}/{jobId}`
  - Open POs for vendor on job. `vendorType=2` for subs/vendors.
- `GET /api/v1/Bills/GetBillMapping?purchaseOrderId={poId}&jobId={jobId}&billId=0`
  - Pre-fills line items from a PO. **Not captured** on 2 Sep 2026.
    `purchaseOrderId: -1` / `isCreateNewFromPO: false` until it is.
- `POST /api/v1/bills?jobId={jobId}` — create bill as Draft (`status` 9).
  Amounts stay 0 on this POST. Payload builder:
  `apps/gateway/src/bills-payload.ts` / `apps/bt-service/app/bills_payload.py`.
- `PUT /api/v1/bills/{billId}` — Save draft (`saveAsDraft: true`). Exclusive
  `unitCost` / `builderCost`. PDF is **not** on this PUT.
- `POST /api/documents/61/tempFile?jobId={jobId}&uploadFullResPhoto=true` —
  multipart staging for a bill PDF (`#fileList`). Not `ocr-upload`.
- `POST /api/Documents/EntityDocs` — attach one temp doc to the bill
  (`documentType` 58, `id: [billId]`, notify flags false).
- `GET /api/v1/bills/{billId}` — fetch saved bill.

### Lookups
- `GET /api/jobpicker/GetExistingJobList` — all jobs for the user.
- `POST /api/jobpicker/GetJobPickerData` — paginated/filtered jobs.

### Not yet captured (TODO)
- Real PO link (`GET /api/v1/Bills/GetBillMapping`) — list helper is captured
- Bill deletion
- Job-folder `docs.upload` (bill PDF attach is captured as `bills.attach`)

The TypeScript gateway (`apps/gateway`) is the living map for jobs, leads,
contacts, owner invoices, variations, POs, estimates, documents, and costing.
See `buildertrend-api-map.md` and `docs/slice-c-captures.md`.

The sidecar now also exposes `POST /internal/bt-request` so the gateway can
reuse Chrome TLS impersonation without reimplementing cookies in Node.

## User type enum (`performingUserType`)

Seen in `assignedTo.options[].extraData.userType`:
- `0` — Unassigned/system
- `1` — Internal user
- `2` — Sub/Vendor
- `3` — Misc (uses `miscPaidToName` instead of an ID)

## Cost types in line items

Captured 2 Sep 2026 on bills: `costTypes: []` on create, `costTypes: [-1]`
on Save draft. Do not send the old guessed `[7]`. Dummy `4000 GST` /
`costTypes` patterns from owner change-orders do **not** apply to bills.
